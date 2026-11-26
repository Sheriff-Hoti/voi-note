import { concat, createChunker, type Chunk, type Chunker, type Cut } from './chunker';
import { createNotesRepository, type Note } from './notes-repository';
import { joinTranscript } from './transcript';
import {
  SAMPLE_RATE,
  type AudioFiles,
  type AudioSource,
  type Clock,
  type SpeechEngine,
  type SqlExecutor,
} from './ports';

export type { Note } from './notes-repository';

/** What the capture side of the app is doing, for the screens. */
export type CaptureState =
  | { kind: 'idle' }
  /**
   * `elapsedMs`: how much audio the Recording holds so far. `textSoFar`: the Transcript of the chunks
   * decoded so far, a few seconds behind the speaker.
   */
  | { kind: 'recording'; elapsedMs: number; textSoFar: string }
  /** Stopped; the Transcript is being made. */
  | { kind: 'finishing' }
  /** Discarded: no Note, and its audio is kept for UNDO_WINDOW_MS in case of an Undo. */
  | { kind: 'discarded' };

/** How long a Discarded Recording can be restored with Undo before its audio is deleted. */
export const UNDO_WINDOW_MS = 5_000;
/** A Recording stops by itself, as Stop does, once it holds 5 minutes of audio. */
const MAX_RECORDING_SAMPLES = 5 * 60 * SAMPLE_RATE;

export interface VoiceNotes {
  getState(): CaptureState;
  /** Calls `listener` after every change of getState(). Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Calls `listener` after a Note is added or changed. Returns the unsubscribe function. */
  onNotesChanged(listener: () => void): () => void;

  /**
   * Called once per app process, at launch. With the Speech Model installed it starts loading it, and
   * on a `fresh` launch (a new process, opened from the home screen) starts a Recording: Instant
   * Capture. Resolves whether it started one. Rejects when that Recording can't start.
   */
  launch(options: { fresh: boolean; speechModelInstalled: boolean }): Promise<boolean>;
  /**
   * Tells the core when the app goes to the background and comes back. Never starts a Recording. In the
   * background the Speech Model is released (after the Recording, if one is running), and a Discard's
   * Undo window ends at once, since its timer can't run there; coming back loads it again (ADR 0004).
   */
  appStateChanged(appState: 'active' | 'background'): void;

  /**
   * Starts a Recording, and loads the Speech Model if it isn't loaded yet. Audio is buffered while it
   * loads. Starting one during a Discard's Undo window ends that window. Rejects when recording or
   * finishing, or when the microphone can't start.
   */
  startRecording(): Promise<void>;
  /**
   * Stops the Recording, waits for its last chunk to be transcribed, and resolves the new ready Note,
   * its audio kept as a WAV. When nothing was said (an empty Transcript) it resolves null instead: no
   * Note is made and the audio is deleted. A Recording that reaches 5 minutes stops by itself the same
   * way, with no warning; calling stop() while a Note is being saved (the cap's, or an Undo's) resolves
   * that one. Rejects when not recording, or when the Speech Model fails.
   */
  stop(): Promise<Note | null>;

  /**
   * Discards the Recording: the microphone stops and no Note is made. Its audio is kept for
   * UNDO_WINDOW_MS (state `discarded`), then deleted. Starting a new Recording ends the window early.
   * Resolves once the microphone has stopped. Rejects when not recording.
   */
  discard(): Promise<void>;
  /**
   * Undo of a Discard, within its window: restores the Recording as if Stop had been tapped, and
   * resolves what stop() would. Rejects when there is no Discard to undo (its window has passed).
   */
  undoDiscard(): Promise<Note | null>;

  /** Every Note, newest first. */
  listNotes(): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
  /**
   * Replaces the Note's text with `text`; the Transcript is not kept. Edits are saved in the order they
   * are made. Rejects when there is no such Note.
   */
  editNote(id: string, text: string): Promise<void>;
  /** Deletes the Note and its audio. Rejects when there is no such Note. */
  deleteNote(id: string): Promise<void>;
  /** The Note's text to share, with every edit made so far saved. Rejects when there is no such Note. */
  shareText(id: string): Promise<string>;
}

export function createVoiceNotes(deps: {
  audio: AudioSource;
  engine: SpeechEngine;
  files: AudioFiles;
  sql: SqlExecutor;
  clock: Clock;
}): VoiceNotes {
  const { audio, engine, files, sql, clock } = deps;
  const notes = createNotesRepository(sql);
  const stateListeners = new Set<() => void>();
  const notesListeners = new Set<() => void>();
  let state: CaptureState = { kind: 'idle' };
  let speechModelReady: Promise<void> | null = null;
  let recording: Recording | null = null;
  /** The Discarded Recording, while its Undo window runs. */
  let discarded: Discarded | null = null;
  /** The Note being saved by Stop, the cap or Undo. */
  let finishing: Promise<Note | null> | null = null;
  /** Settles once the last release of the Speech Model is done; a load waits for it. */
  let releaseDone: Promise<void> = Promise.resolve();
  let inBackground = false;
  /** The Speech Model was released in the background: load it again when the app comes back. */
  let reloadWhenActive = false;
  /** Settles once the last edit or delete is saved: each waits for the one before, so the last wins. */
  let noteWrites: Promise<unknown> = Promise.resolve();

  function setState(next: CaptureState) {
    state = next;
    stateListeners.forEach((l) => l());
  }

  /** Loads and warms up the Speech Model once; a failed load is tried again next time. */
  function loadSpeechModel(): Promise<void> {
    speechModelReady ??= releaseDone
      .then(() => engine.load())
      .then(() => engine.warmUp())
      .catch((error: unknown) => {
        speechModelReady = null;
        throw error;
      });
    return speechModelReady;
  }

  /** Frees the Speech Model once it has finished loading; the next Recording loads it again. */
  function releaseSpeechModel() {
    const ready = speechModelReady;
    if (!ready) return;
    speechModelReady = null;
    reloadWhenActive = true;
    releaseDone = ready
      .then(
        () => engine.release(),
        () => {} // It never loaded: nothing to free.
      )
      .catch((error: unknown) => console.error('[voice-notes] release failed', error));
  }

  const msOf = (samples: number) => Math.round((samples / SAMPLE_RATE) * 1000);

  function showRecording(current: Recording) {
    if (recording === current && !current.ended)
      setState({
        kind: 'recording',
        elapsedMs: msOf(current.samples),
        textSoFar: current.transcript,
      });
  }

  /** Queues a chunk's decode after the ones before it; they wait for the Speech Model to load. */
  function decode(current: Recording, chunk: Chunk) {
    current.decodeQueue = current.decodeQueue.then(async () => {
      if (current.failure || current.dropped) return;
      try {
        await loadSpeechModel();
        const text = (await engine.transcribe(chunk.samples)).trim();
        if (text) {
          current.transcript = joinTranscript(current.transcript, current.lastCut, text);
          current.lastCut = chunk.cut;
        }
        showRecording(current);
      } catch (error) {
        current.failure = { error };
      }
    });
  }

  /** Stops the microphone and writes the Recording's audio. Resolves its path. */
  async function endCapture(current: Recording, id: string): Promise<string> {
    try {
      await audio.stop();
    } finally {
      recording = null;
    }
    // Read only now: frames delivered while the microphone stopped belong to the Recording.
    return files.writeWav(id, concat(current.frames));
  }

  /**
   * Transcribes the rest of a stopped Recording and saves it as a ready Note. Resolves null, and deletes
   * the audio, when nothing was said.
   */
  async function saveNote(current: Recording, id: string, audioPath: string): Promise<Note | null> {
    current.chunker.end();
    await current.decodeQueue;
    if (current.failure) {
      // No Note points at the audio, so don't leave it behind. (Ticket #2 keeps it as a Pending Note.)
      await files.remove(audioPath).catch(() => {});
      throw current.failure.error;
    }
    const text = current.transcript;
    if (!text) {
      await files.remove(audioPath);
      return null;
    }
    const note: Note = {
      id,
      createdAt: current.startedAt,
      status: 'ready',
      text,
      audioPath,
      durationMs: msOf(current.samples),
    };
    await notes.insert(note);
    notesListeners.forEach((l) => l());
    return note;
  }

  /** Runs `write` after the edits and deletes before it, then tells the listeners. */
  function writeNote<T>(write: () => Promise<T>): Promise<T> {
    const done = noteWrites.then(write);
    noteWrites = done.catch(() => {});
    return done.then((result) => {
      notesListeners.forEach((l) => l());
      return result;
    });
  }

  /** Shows `finishing` while `save` runs (Stop, the cap or Undo), then idle. */
  function finish(save: () => Promise<Note | null>): Promise<Note | null> {
    setState({ kind: 'finishing' });
    const saving = save().finally(() => {
      finishing = null;
      setState({ kind: 'idle' });
      if (inBackground) releaseSpeechModel();
    });
    finishing = saving;
    return saving;
  }

  /** Ends the Undo window of the Discarded Recording: its audio is deleted. */
  function endUndoWindow() {
    const held = discarded;
    if (!held) return;
    clearTimeout(held.timer);
    discarded = null;
    held.recording.dropped = true;
    held.audioPath
      .then((path) => files.remove(path))
      .catch((error: unknown) =>
        console.error('[voice-notes] deleting Discarded audio failed', error)
      );
    if (state.kind === 'discarded') setState({ kind: 'idle' });
    // Its last decodes may still run: release once they are done.
    void held.recording.decodeQueue.then(() => {
      if (inBackground && !recording && !discarded && state.kind === 'idle') releaseSpeechModel();
    });
  }

  const voiceNotes: VoiceNotes = {
    getState: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onNotesChanged(listener) {
      notesListeners.add(listener);
      return () => notesListeners.delete(listener);
    },

    async launch({ fresh, speechModelInstalled }) {
      if (!speechModelInstalled) return false;
      if (!fresh) {
        loadSpeechModel().catch(() => {});
        return false;
      }
      await voiceNotes.startRecording();
      return true;
    },

    appStateChanged(appState) {
      inBackground = appState === 'background';
      // A Recording keeps the Speech Model: Stop releases it if the app is still in the background.
      if (inBackground) {
        // Timers don't fire in the background (ADR 0004): the Undo window ends here, and releases
        // the Speech Model once its last decodes are done.
        // While a Note is saved, finish() releases it once the last decode is done.
        if (discarded) endUndoWindow();
        else if (!recording && !finishing) releaseSpeechModel();
        return;
      }
      if (reloadWhenActive) {
        reloadWhenActive = false;
        loadSpeechModel().catch(() => {}); // A failure surfaces at the next Stop.
      }
    },

    async startRecording() {
      // Its decodes go after the Discarded Recording's last one: one decode at a time on the Speech Model.
      const decodesBefore = discarded?.recording.decodeQueue ?? Promise.resolve();
      if (state.kind === 'discarded') endUndoWindow();
      if (state.kind !== 'idle') throw new Error(`Can't start a Recording while ${state.kind}`);
      const current: Recording = {
        startedAt: clock.now(),
        frames: [],
        samples: 0,
        chunker: createChunker((chunk) => decode(current, chunk)),
        transcript: '',
        lastCut: null,
        decodeQueue: decodesBefore,
        failure: null,
        ended: false,
        dropped: false,
      };
      recording = current;
      showRecording(current);
      try {
        await audio.start((frame) => {
          if (recording !== current) return;
          current.frames.push(frame);
          current.samples += frame.length;
          current.chunker.push(frame);
          // While stopping, the microphone still flushes its last frames: kept, but no longer shown.
          showRecording(current);
          // The cap counts audio, not a timer: timers don't fire in the background (ADR 0004).
          if (current.samples >= MAX_RECORDING_SAMPLES && !current.ended) {
            voiceNotes
              .stop()
              .catch((error: unknown) =>
                console.error('[voice-notes] Stop at the cap failed', error)
              );
          }
        });
      } catch (error) {
        recording = null;
        setState({ kind: 'idle' });
        throw error;
      }
      // Loads in the background; stop() waits for it. A failure surfaces there.
      loadSpeechModel().catch(() => {});
    },

    stop() {
      // The cap stopped it already: a Stop tapped meanwhile gets the same Note.
      if (finishing) return finishing;
      if (state.kind !== 'recording' || !recording) {
        return Promise.reject(new Error(`Can't Stop while ${state.kind}`));
      }
      const current = recording;
      current.ended = true;
      const id = uuid();
      return finish(async () => saveNote(current, id, await endCapture(current, id)));
    },

    async discard() {
      if (state.kind !== 'recording' || !recording) {
        throw new Error(`Can't Discard while ${state.kind}`);
      }
      const current = recording;
      current.ended = true;
      const id = uuid();
      const audioPath = endCapture(current, id);
      audioPath.catch(() => {}); // Rejects to the caller below; nothing to delete then.
      discarded = {
        recording: current,
        id,
        audioPath,
        timer: setTimeout(endUndoWindow, UNDO_WINDOW_MS),
      };
      setState({ kind: 'discarded' });
      await audioPath;
    },

    async undoDiscard() {
      const held = discarded;
      if (!held || state.kind !== 'discarded') throw new Error('Nothing to Undo');
      clearTimeout(held.timer);
      discarded = null;
      return finish(async () => saveNote(held.recording, held.id, await held.audioPath));
    },

    listNotes: () => notes.list(),
    getNote: (id) => notes.get(id),
    editNote: (id, text) =>
      writeNote(async () => {
        if (!(await notes.updateText(id, text))) throw new Error(`No Note ${id}`);
      }),
    deleteNote: (id) =>
      writeNote(async () => {
        const note = await notes.get(id);
        if (!note) throw new Error(`No Note ${id}`);
        // The audio first: if deleting it fails, the Note stays and can be deleted again.
        if (note.audioPath) await files.remove(note.audioPath);
        await notes.remove(id);
      }),
    async shareText(id) {
      await noteWrites;
      const note = await notes.get(id);
      if (!note) throw new Error(`No Note ${id}`);
      return note.text;
    },
  };
  return voiceNotes;
}

type Recording = {
  startedAt: number;
  frames: Float32Array[];
  samples: number;
  chunker: Chunker;
  /** The Transcript of the chunks decoded so far. */
  transcript: string;
  /** How the last chunk with words in it was cut. */
  lastCut: Cut | null;
  /** Settles when every chunk queued so far is decoded. */
  decodeQueue: Promise<void>;
  /** Set when a decode failed; the chunks after it are not decoded. */
  failure: { error: unknown } | null;
  /** Stopped or Discarded: its frames are no longer shown. */
  ended: boolean;
  /** Discarded for good: its remaining chunks are not decoded. */
  dropped: boolean;
};

type Discarded = {
  recording: Recording;
  id: string;
  /** Resolves once the microphone stopped and the audio is written. */
  audioPath: Promise<string>;
  timer: ReturnType<typeof setTimeout>;
};

/** A random (v4) UUID. Hermes has no crypto.randomUUID. */
function uuid(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
