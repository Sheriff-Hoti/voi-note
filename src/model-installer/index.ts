import { DocumentDirectoryPath } from '@dr.pogodin/react-native-fs';

import { expoNetwork, fetchHttp, rnfsFileSystem } from './adapters';
import { createModelInstaller } from './installer';
import { PARAKEET_UNIFIED_EN } from './speech-model';

export {
  DownloadCancelledError,
  DownloadFailedError,
  MobileDataError,
  NotEnoughSpaceError,
  type DownloadProgress,
  type ModelStatus,
} from './installer';
export { PARAKEET_UNIFIED_EN, PARAKEET_UNIFIED_EN_BYTES } from './speech-model';

/** Where the Speech Model's files live: the app's own internal storage. */
export const SPEECH_MODEL_DIR = `${DocumentDirectoryPath}/models/${PARAKEET_UNIFIED_EN.id}`;

export const speechModelInstaller = createModelInstaller({
  model: PARAKEET_UNIFIED_EN,
  dir: SPEECH_MODEL_DIR,
  http: fetchHttp,
  fs: rnfsFileSystem,
  network: expoNetwork,
});
