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
  | { kind: 'finishing' };

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
   * background the Speech Model is released (after the Recording, if one is running); coming back loads
   * it again (ADR 0004).
   */
  appStateChanged(appState: 'active' | 'background'): void;

  /**
   * Starts a Recording, and loads the Speech Model if it isn't loaded yet. Audio is buffered while it
   * loads. Rejects when not idle, or when the microphone can't start.
   */
  startRecording(): Promise<void>;
  /**
   * Stops the Recording, waits for its last chunk to be transcribed, and resolves the new ready Note,
   * its audio kept as a WAV. When nothing was said (an empty Transcript) it resolves null instead: no
   * Note is made and the audio is deleted. Rejects when not recording, or when the Speech Model fails.
   */
  stop(): Promise<Note | null>;

  /** Every Note, newest first. */
  listNotes(): Promise<Note[]>;
  getNote(id: string): Promise<Note | null>;
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
  /** Settles once the last release of the Speech Model is done; a load waits for it. */
  let releaseDone: Promise<void> = Promise.resolve();
  let inBackground = false;
  /** The Speech Model was released in the background: load it again when the app comes back. */
  let reloadWhenActive = false;

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
    if (recording === current && state.kind !== 'finishing')
      setState({
        kind: 'recording',
        elapsedMs: msOf(current.samples),
        textSoFar: current.transcript,
      });
  }

  /** Queues a chunk's decode after the ones before it; they wait for the Speech Model to load. */
  function decode(current: Recording, chunk: Chunk) {
    current.decodeQueue = current.decodeQueue.then(async () => {
      if (current.failure) return;
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
        if (!recording) releaseSpeechModel();
        return;
      }
      if (reloadWhenActive) {
        reloadWhenActive = false;
        loadSpeechModel().catch(() => {}); // A failure surfaces at the next Stop.
      }
    },

    async startRecording() {
      if (state.kind !== 'idle') throw new Error(`Can't start a Recording while ${state.kind}`);
      const current: Recording = {
        startedAt: clock.now(),
        frames: [],
        samples: 0,
        chunker: createChunker((chunk) => decode(current, chunk)),
        transcript: '',
        lastCut: null,
        decodeQueue: Promise.resolve(),
        failure: null,
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
        });
      } catch (error) {
        recording = null;
        setState({ kind: 'idle' });
        throw error;
      }
      // Loads in the background; stop() waits for it. A failure surfaces there.
      loadSpeechModel().catch(() => {});
    },

    async stop() {
      if (state.kind !== 'recording' || !recording) {
        throw new Error(`Can't Stop while ${state.kind}`);
      }
      const current = recording;
      setState({ kind: 'finishing' });
      try {
        await audio.stop();
        recording = null;
        // Read only now: frames delivered while the microphone stopped belong to the Recording.
        const { startedAt, frames, samples } = current;
        current.chunker.end();
        const id = uuid();
        const audioPath = await files.writeWav(id, concat(frames));
        await current.decodeQueue;
        if (current.failure) {
          // No Note points at the audio, so don't leave it behind. (Ticket #9 keeps it as a Pending Note.)
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
          createdAt: startedAt,
          status: 'ready',
          text,
          audioPath,
          durationMs: msOf(samples),
        };
        await notes.insert(note);
        notesListeners.forEach((l) => l());
        return note;
      } finally {
        recording = null;
        setState({ kind: 'idle' });
        if (inBackground) releaseSpeechModel();
      }
    },

    listNotes: () => notes.list(),
    getNote: (id) => notes.get(id),
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
};

/** A random (v4) UUID. Hermes has no crypto.randomUUID. */
function uuid(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
