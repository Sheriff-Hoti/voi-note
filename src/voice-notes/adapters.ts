import * as RNFS from '@dr.pogodin/react-native-fs';
import * as SQLite from 'expo-sqlite';
import { createPcmLiveStream } from 'react-native-sherpa-onnx/audio';
import { createSTT, type SttEngine } from 'react-native-sherpa-onnx/stt';

import {
  FRAME_SAMPLES,
  SAMPLE_RATE,
  type AudioFiles,
  type AudioSource,
  type SpeechEngine,
  type SqlExecutor,
} from './ports';

/**
 * The microphone through react-native-sherpa-onnx's PCM live stream (native capture, resampled to
 * 16 kHz). Its pieces are not exactly 100 ms, so they are re-cut into FRAME_SAMPLES frames here.
 * Needs RECORD_AUDIO granted before start().
 */
export function sherpaAudioSource(): AudioSource {
  const pcm = createPcmLiveStream({
    sampleRate: SAMPLE_RATE,
    channelCount: 1,
    bufferSizeFrames: FRAME_SAMPLES,
  });
  let unsubscribe: (() => void)[] = [];

  return {
    async start(onFrame) {
      let frame = new Float32Array(FRAME_SAMPLES);
      let filled = 0;
      unsubscribe = [
        pcm.onData((samples) => {
          let read = 0;
          while (read < samples.length) {
            const n = Math.min(FRAME_SAMPLES - filled, samples.length - read);
            frame.set(samples.subarray(read, read + n), filled);
            filled += n;
            read += n;
            if (filled === FRAME_SAMPLES) {
              onFrame(frame);
              frame = new Float32Array(FRAME_SAMPLES);
              filled = 0;
            }
          }
        }),
        pcm.onError((message) => console.error('[audio-source] microphone error', message)),
      ];
      try {
        await pcm.start();
      } catch (error) {
        unsubscribe.forEach((u) => u());
        unsubscribe = [];
        throw error;
      }
    },
    async stop() {
      try {
        await pcm.stop();
      } finally {
        unsubscribe.forEach((u) => u());
        unsubscribe = [];
      }
    },
  };
}

/** The Speech Model on react-native-sherpa-onnx's offline recognizer (ADR 0002), 4 threads. */
export function sherpaSpeechEngine(modelDir: string): SpeechEngine {
  let stt: SttEngine | null = null;
  const loaded = () => {
    if (!stt) throw new Error('The Speech Model is not loaded');
    return stt;
  };

  return {
    async load() {
      if (stt) return;
      stt = await createSTT({
        modelPath: { type: 'file', path: modelDir },
        modelType: 'auto',
        numThreads: 4,
      });
    },
    async warmUp() {
      await loaded().transcribeSamples(new Array(SAMPLE_RATE / 2).fill(0), SAMPLE_RATE);
    },
    async transcribe(samples) {
      return (await loaded().transcribeSamples(Array.from(samples), SAMPLE_RATE)).text;
    },
    async release() {
      const engine = stt;
      stt = null;
      await engine?.destroy();
    },
  };
}

/** Recordings as 16-bit PCM WAV files in `dir`. */
export function rnfsAudioFiles(dir: string): AudioFiles {
  return {
    async writeWav(name, samples) {
      await RNFS.mkdir(dir);
      const path = `${dir}/${name}.wav`;
      if (await RNFS.exists(path)) await RNFS.unlink(path);
      await RNFS.appendFile(path, encodeWav(samples));
      return path;
    },
    async remove(path) {
      if (await RNFS.exists(path)) await RNFS.unlink(path);
    },
  };
}

/** A 16 kHz mono 16-bit PCM WAV of `samples` in [-1, 1]. */
export function encodeWav(samples: Float32Array): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** SQL on expo-sqlite. The database file is opened on the first statement. */
export function expoSqlExecutor(databaseName: string): SqlExecutor {
  let db: Promise<SQLite.SQLiteDatabase> | null = null;
  return {
    async execute(sql, params = []) {
      db ??= SQLite.openDatabaseAsync(databaseName);
      return (await db).getAllAsync(sql, params);
    },
  };
}
