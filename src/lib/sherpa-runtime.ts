import { testSherpaInit } from 'react-native-sherpa-onnx';

/**
 * Loads the sherpa-onnx native libraries (and with them ONNX Runtime) and logs the outcome.
 * Called once at launch so a broken native swap (ADR 0002) shows up immediately rather than
 * at the first Recording. A failing dlopen throws inside the native module and is logged here.
 */
export async function checkSherpaRuntime(): Promise<void> {
  try {
    console.log('[sherpa-runtime] sherpa-onnx loaded:', await testSherpaInit());
  } catch (error) {
    console.error('[sherpa-runtime] sherpa-onnx failed to load', error);
  }
}
