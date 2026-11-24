import { DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';

import { createModelInstaller } from './installer';
import { rnfsFileSystem, rnfsHttp } from './rnfs-adapters';
import { PARAKEET_UNIFIED_EN } from './speech-model';

export type { DownloadProgress, ModelStatus } from './installer';
export { PARAKEET_UNIFIED_EN, PARAKEET_UNIFIED_EN_BYTES } from './speech-model';

/** Where the Speech Model's files live: the app's own internal storage. */
export const SPEECH_MODEL_DIR = `${DocumentDirectoryPath}/models/${PARAKEET_UNIFIED_EN.id}`;

export const speechModelInstaller = createModelInstaller({
  model: PARAKEET_UNIFIED_EN,
  dir: SPEECH_MODEL_DIR,
  http: rnfsHttp,
  fs: rnfsFileSystem,
});
