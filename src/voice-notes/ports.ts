/** Ports the voice-notes core depends on. Real adapters: `adapters.ts`. Test fakes: `fakes.ts`. */

/** Samples per second of every Recording: 16 kHz mono. */
export const SAMPLE_RATE = 16_000;
/** One frame is 100 ms of audio. */
export const FRAME_SAMPLES = 1_600;

/** The microphone, as a stream of 16 kHz mono PCM frames of FRAME_SAMPLES samples in [-1, 1]. */
export interface AudioSource {
  /** Starts capture. `onFrame` is called once per 100 ms frame until stop(). Rejects if capture can't start. */
  start(onFrame: (frame: Float32Array) => void): Promise<void>;
  /** Stops capture. No frame arrives after it resolves. */
  stop(): Promise<void>;
}

/** The Speech Model, loaded into memory. */
export interface SpeechEngine {
  /** Loads the Speech Model. Slow (seconds); audio is buffered meanwhile. */
  load(): Promise<void>;
  /** One decode of a short silence, so the first real decode isn't slow. */
  warmUp(): Promise<void>;
  /** The Transcript of 16 kHz mono audio. */
  transcribe(samples: Float32Array): Promise<string>;
  /** Frees the Speech Model's memory. load() must run again before the next transcribe(). */
  release(): Promise<void>;
}

/** Where a Recording's audio is kept. */
export interface AudioFiles {
  /** Writes `samples` as a 16 kHz mono WAV named after `name`, and returns its path. */
  writeWav(name: string, samples: Float32Array): Promise<string>;
  /** Deletes the file if it exists. */
  remove(path: string): Promise<void>;
}

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

/** Runs one SQL statement. Resolves the rows it returns (none for a statement that returns none). */
export interface SqlExecutor {
  execute(sql: string, params?: SqlValue[]): Promise<SqlRow[]>;
}

export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}
