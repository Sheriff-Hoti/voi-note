# Speech engine: react-native-sherpa-onnx with an install-time native swap

The Speech Model runs through `react-native-sherpa-onnx` (0.4.4), with a postinstall script that swaps its bundled sherpa-onnx for **2.0.3** and its ONNX Runtime for **k2-fsa's 1.28.2** (taken from the same AAR). The swap is needed because Parakeet Unified EN needs sherpa-onnx >= 2.0.2, and sherpa 2.0.3 links against `OrtGetApiBase@VERS_1.28.2`. With the library's own ORT 1.25 the app aborts at startup (`cannot locate symbol OrtGetApiBase`). We chose this over a hand-written Kotlin module so the app stays Expo React Native with no native code of our own. The prototype confirmed it on the Galaxy A54 (branch `prototype/speech-engine-rn-sherpa`).

## Considered Options

- **Custom Expo module in Kotlin on the sherpa-onnx AAR**: most control, but native code we would own. Started on branch `prototype/speech-engine`; not needed.
- **whisper.rn**: no Parakeet Unified support.
- **transcribe.cpp** (what Orca uses): no Android build.

## Consequences

- Pin the `react-native-sherpa-onnx` version. Any upgrade can undo the swap, so after every build check that the APK contains `OrtGetApiBase@VERS_1.28.2`.
- If R8 is enabled, keep `com.k2fsa.sherpa.onnx.**`: sherpa's JNI reads those fields by name, and the library ships no keep rule.
- The library's VAD module is a placeholder, so pause detection is our own JS energy detector.
- Live (streaming) transcription was dropped: on the A54 its RTF was 2.7–3.9. v1 uses the offline export, decoded in chunks during the Recording.
