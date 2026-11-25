import { DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';

import { SPEECH_MODEL_DIR } from '@/model-installer';

import { expoSqlExecutor, rnfsAudioFiles, sherpaAudioSource, sherpaSpeechEngine } from './adapters';
import { createVoiceNotes } from './core';

export type { CaptureState, Note, VoiceNotes } from './core';

/** The app's one voice-notes core, on the phone's microphone, Speech Model, files and SQLite. */
export const voiceNotes = createVoiceNotes({
  audio: sherpaAudioSource(),
  engine: sherpaSpeechEngine(SPEECH_MODEL_DIR),
  files: rnfsAudioFiles(`${DocumentDirectoryPath}/recordings`),
  sql: expoSqlExecutor('voi-note.db'),
  clock: { now: () => Date.now() },
});
