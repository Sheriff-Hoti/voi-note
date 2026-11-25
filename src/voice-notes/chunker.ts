/**
 * Cuts a Recording's frames into chunks for the Speech Model, at the speaker's pauses (spec #1,
 * "Chunked transcription during a Recording"). Pause detection is an energy detector on 100 ms frames
 * with a minimum-tracking noise floor; the constants come from the prototype.
 */

/** 0.6 s of pause ends a chunk. */
const PAUSE_FRAMES = 6;
/** A chunk never grows past 12 s: about 1.5 s of decoding on the A54, the most Stop should wait. */
const MAX_FRAMES = 120;
/** A hard cut goes at the quietest frame of the chunk's last 5 s. */
const HARD_CUT_SEARCH_FRAMES = 50;
/** A frame is speech when its energy is at least noise floor × SPEECH_RATIO + SPEECH_MARGIN. */
const SPEECH_RATIO = 2.5;
const SPEECH_MARGIN = 0.003;
/** How fast the noise floor rises toward louder frames; it drops at once to a quieter one. */
const FLOOR_RISE = 0.005;

/** Where a chunk ended: at a pause, at the 12 s hard cut, or at the end of the Recording. */
export type Cut = 'pause' | 'hard' | 'end';

/** One chunk of a Recording, ready to decode. */
export type Chunk = { samples: Float32Array; cut: Cut };

export interface Chunker {
  /** Takes the next 100 ms frame; calls onChunk when it closes a chunk. */
  push(frame: Float32Array): void;
  /** Closes the last chunk, at the end of the Recording. */
  end(): void;
}

export function createChunker(onChunk: (chunk: Chunk) => void): Chunker {
  let frames: { frame: Float32Array; energy: number }[] = [];
  let hasVoice = false;
  let pauseRun = 0;
  // Starts at 0 and rises slowly, so speech from the very first frame is heard as speech.
  let noiseFloor = 0;

  const isSpeech = (energy: number) => energy >= noiseFloor * SPEECH_RATIO + SPEECH_MARGIN;

  /** Closes the chunk after its first `length` frames; the rest start the next one. */
  function cut(length: number, kind: Cut) {
    if (hasVoice)
      onChunk({ samples: concat(frames.slice(0, length).map((f) => f.frame)), cut: kind });
    frames = frames.slice(length);
    hasVoice = frames.some((f) => isSpeech(f.energy));
    pauseRun = 0;
  }

  /** The quietest of the last HARD_CUT_SEARCH_FRAMES frames; the latest one on a tie. */
  function quietestRecentFrame(): number {
    let best = frames.length - 1;
    for (let i = best - 1; i >= Math.max(1, frames.length - HARD_CUT_SEARCH_FRAMES); i--)
      if (frames[i].energy < frames[best].energy) best = i;
    return best;
  }

  return {
    push(frame) {
      const energy = rms(frame);
      noiseFloor =
        energy < noiseFloor ? energy : noiseFloor * (1 - FLOOR_RISE) + energy * FLOOR_RISE;
      frames.push({ frame, energy });
      if (isSpeech(energy)) {
        hasVoice = true;
        pauseRun = 0;
      } else pauseRun++;
      if (pauseRun >= PAUSE_FRAMES) cut(frames.length, 'pause');
      else if (frames.length >= MAX_FRAMES) cut(quietestRecentFrame() + 1, 'hard');
    },
    end() {
      if (frames.length) cut(frames.length, 'end');
    },
  };
}

function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / Math.max(frame.length, 1));
}

/** The frames as one stretch of audio. */
export function concat(frames: Float32Array[]): Float32Array {
  const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}
