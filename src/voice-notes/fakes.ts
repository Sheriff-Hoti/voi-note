import { DatabaseSync } from 'node:sqlite';

import {
  FRAME_SAMPLES,
  type AudioFiles,
  type AudioSource,
  type Clock,
  type SpeechEngine,
  type SqlExecutor,
  type SqlValue,
} from './ports';

/** A microphone whose frames the test sends with `speak` and `silence`. */
export class FakeAudioSource implements AudioSource {
  capturing = false;
  /** Frames of speech still delivered while stop() runs, as the real microphone flushes its buffer. */
  framesDuringStop = 0;
  /** When set, start() rejects with this error, as when another app holds the microphone. */
  failToStart: Error | null = null;
  private onFrame: ((frame: Float32Array) => void) | null = null;

  async start(onFrame: (frame: Float32Array) => void) {
    if (this.failToStart) throw this.failToStart;
    this.onFrame = onFrame;
    this.capturing = true;
  }

  async stop() {
    await Promise.resolve();
    this.speak(this.framesDuringStop);
    this.onFrame = null;
    this.capturing = false;
  }

  /**
   * Sends `frames` 100 ms frames of speech-like audio: a 0.3 amplitude tone, with every 4th frame a
   * near-silent gap between words. Real speech has those gaps, and they keep the pause detector's noise
   * floor down; a steady tone would drift into counting as pause after about 10 s.
   */
  speak(frames: number): void {
    for (let i = 0; i < frames; i++) this.send(tone(i % 4 === 3 ? 0.005 : 0.3));
  }

  /** Sends `frames` 100 ms frames of silence. */
  silence(frames: number): void {
    for (let i = 0; i < frames; i++) this.send(new Float32Array(FRAME_SAMPLES));
  }

  private send(frame: Float32Array) {
    if (!this.onFrame) throw new Error('the microphone is not capturing');
    this.onFrame(frame);
  }
}

function tone(amplitude: number): Float32Array {
  const frame = new Float32Array(FRAME_SAMPLES);
  for (let i = 0; i < frame.length; i++)
    frame[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / 16_000);
  return frame;
}

/**
 * A Speech Model that answers each transcribe() with the next of `transcripts` (then ''), and records
 * the audio it was given.
 */
export class FakeSpeechEngine implements SpeechEngine {
  loaded = false;
  /** How many times the Speech Model was loaded. */
  loads = 0;
  /** When set, load() rejects with this error, as with a corrupt or missing Speech Model. */
  failToLoad: Error | null = null;
  /** The audio each transcribe() received, in order. */
  readonly received: Float32Array[] = [];
  private readonly transcripts: string[] = [];
  private loadGate: Promise<void> | null = null;

  /** Makes load() wait, as the real Speech Model takes seconds to load. Call the result to let it finish. */
  holdLoad(): () => void {
    let release!: () => void;
    this.loadGate = new Promise((resolve) => (release = resolve));
    return release;
  }

  willTranscribe(...transcripts: string[]): void {
    this.transcripts.push(...transcripts);
  }

  async load() {
    await this.loadGate;
    if (this.failToLoad) throw this.failToLoad;
    this.loads++;
    this.loaded = true;
  }

  async warmUp() {
    if (!this.loaded) throw new Error('warmUp before load');
  }

  async transcribe(samples: Float32Array) {
    if (!this.loaded) throw new Error('transcribe before load');
    this.received.push(samples);
    return this.transcripts.shift() ?? '';
  }

  async release() {
    this.loaded = false;
  }
}

/** Audio files in memory: path → samples. */
export class FakeAudioFiles implements AudioFiles {
  readonly files = new Map<string, Float32Array>();

  async writeWav(name: string, samples: Float32Array) {
    const path = `/audio/${name}.wav`;
    this.files.set(path, samples);
    return path;
  }

  async remove(path: string) {
    this.files.delete(path);
  }
}

/** Real SQLite (Node's built-in), in memory. Pass the same instance to a second core to simulate a relaunch. */
export class NodeSqlExecutor implements SqlExecutor {
  private readonly db = new DatabaseSync(':memory:');

  async execute(sql: string, params: SqlValue[] = []) {
    return this.db.prepare(sql).all(...params) as Record<string, SqlValue>[];
  }
}

/** A clock the test sets. */
export class FakeClock implements Clock {
  constructor(public time = Date.UTC(2026, 10, 25, 9, 0)) {}

  now() {
    return this.time;
  }
}
