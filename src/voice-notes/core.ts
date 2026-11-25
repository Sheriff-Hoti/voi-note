import { createNotesRepository, type Note } from './notes-repository';
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
  /** `elapsedMs`: how much audio the Recording holds so far. */
  | { kind: 'recording'; elapsedMs: number }
  /** Stopped; the Transcript is being made. */
  | { kind: 'finishing' };

export interface VoiceNotes {
  getState(): CaptureState;
  /** Calls `listener` after every change of getState(). Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Calls `listener` after a Note is added or changed. Returns the unsubscribe function. */
  onNotesChanged(listener: () => void): () => void;

  /**
   * Starts a Recording, and loads the Speech Model if it isn't loaded yet. Audio is buffered while it
   * loads. Rejects when not idle, or when the microphone can't start.
   */
  startRecording(): Promise<void>;
  /**
   * Stops the Recording, transcribes all of it, and resolves the new ready Note. The Recording's audio
   * is kept as a WAV. Rejects when not recording, or when the Speech Model fails.
   */
  stop(): Promise<Note>;

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
  let recording: { startedAt: number; frames: Float32Array[]; samples: number } | null = null;

  function setState(next: CaptureState) {
    state = next;
    stateListeners.forEach((l) => l());
  }

  /** Loads and warms up the Speech Model once; a failed load is tried again next time. */
  function loadSpeechModel(): Promise<void> {
    speechModelReady ??= engine
      .load()
      .then(() => engine.warmUp())
      .catch((error: unknown) => {
        speechModelReady = null;
        throw error;
      });
    return speechModelReady;
  }

  const msOf = (samples: number) => Math.round((samples / SAMPLE_RATE) * 1000);

  return {
    getState: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    onNotesChanged(listener) {
      notesListeners.add(listener);
      return () => notesListeners.delete(listener);
    },

    async startRecording() {
      if (state.kind !== 'idle') throw new Error(`Can't start a Recording while ${state.kind}`);
      const current = { startedAt: clock.now(), frames: [] as Float32Array[], samples: 0 };
      recording = current;
      setState({ kind: 'recording', elapsedMs: 0 });
      try {
        await audio.start((frame) => {
          if (recording !== current) return;
          current.frames.push(frame);
          current.samples += frame.length;
          // While stopping, the microphone still flushes its last frames: kept, but no longer shown.
          if (state.kind === 'recording')
            setState({ kind: 'recording', elapsedMs: msOf(current.samples) });
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
        const all = concat(frames, samples);
        const id = uuid();
        const audioPath = await files.writeWav(id, all);
        let text: string;
        try {
          await loadSpeechModel();
          text = (await engine.transcribe(all)).trim();
        } catch (error) {
          // No Note points at the audio, so don't leave it behind. (Ticket #9 keeps it as a Pending Note.)
          await files.remove(audioPath).catch(() => {});
          throw error;
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
      }
    },

    listNotes: () => notes.list(),
    getNote: (id) => notes.get(id),
  };
}

function concat(frames: Float32Array[], samples: number): Float32Array {
  const out = new Float32Array(samples);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

/** A random (v4) UUID. Hermes has no crypto.randomUUID. */
function uuid(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
