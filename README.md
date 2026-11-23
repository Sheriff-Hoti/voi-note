# voi-note

Android app (Expo React Native) that turns a spoken Recording into a text Note, transcribed on the phone.
See `GLOSSARY.md` for the domain terms and `docs/adr/` for the decisions behind the stack.

## Setup

```sh
mise install   # Java 17, Node 24, Android SDK (ANDROID_HOME = ~/Android/Sdk), see mise.toml
npm install    # postinstall swaps in sherpa-onnx 2.0.3 + ONNX Runtime 1.28.2 (ADR 0002)
```

The swap downloads two AARs and the C headers into `.sherpa-cache/` once (`SHERPA_CACHE` overrides the location).
Never bump `react-native-sherpa-onnx` (pinned at 0.4.4) without re-checking the swap.

## Build and run

The app needs a development build (it has native code), not Expo Go.

```sh
npx expo run:android   # build the dev client and install it on the USB-connected phone (USB debugging on)
npx expo start         # day-to-day: start Metro and open the already-installed dev client
```

Every `assembleDebug`/`assembleRelease` runs `scripts/check-ort-symbol.sh`, which fails the build unless the
APK pairs sherpa-onnx with ONNX Runtime's `OrtGetApiBase@VERS_1.28.2`. Run it by hand with `npm run check:apk`.
If it fails, re-run `npm install` and rebuild. At launch the app logs `[sherpa-runtime] sherpa-onnx loaded`.

## Checks

```sh
npm test            # Jest (jest-expo)
npm run typecheck   # tsc --noEmit
```
