#!/usr/bin/env bash
# Build check for ADR 0002: fail unless every APK under the given path (file or directory) ships
# ONNX Runtime that exports OrtGetApiBase@@VERS_1.28.2 and a sherpa-onnx that imports OrtGetApiBase@VERS_1.28.2.
# Without that pairing the app aborts at startup ("cannot locate symbol OrtGetApiBase").
# Run automatically after assembleDebug/assembleRelease (plugins/with-android-build.js), or by hand:
#   npm run check:apk
set -euo pipefail
WANT=VERS_1.28.2
TARGET="${1:-android/app/build/outputs/apk}"
READELF="$(command -v readelf || command -v llvm-readelf || true)"
if [ -z "$READELF" ] && [ -n "${ANDROID_HOME:-}" ]; then
  READELF="$(ls "$ANDROID_HOME"/ndk/*/toolchains/llvm/prebuilt/*/bin/llvm-readelf 2>/dev/null | tail -1 || true)"
fi
[ -n "$READELF" ] || { echo "[ort-check] no readelf or llvm-readelf found" >&2; exit 2; }

if [ -f "$TARGET" ]; then APKS=("$TARGET"); else mapfile -t APKS < <(find "$TARGET" -name '*.apk' 2>/dev/null); fi
[ "${#APKS[@]}" -gt 0 ] || { echo "[ort-check] FAIL: no APK found under $TARGET" >&2; exit 1; }

fail=0
for apk in "${APKS[@]}"; do
  tmp="$(mktemp -d)"
  unzip -q -o "$apk" 'lib/*/libonnxruntime.so' 'lib/*/libsherpa-onnx-c-api.so' -d "$tmp" 2>/dev/null || true
  abis=$(ls "$tmp/lib" 2>/dev/null || true)
  if [ -z "$abis" ]; then echo "[ort-check] FAIL: $apk has no libonnxruntime.so / libsherpa-onnx-c-api.so" >&2; fail=1; fi
  for abi in $abis; do
    ort="$tmp/lib/$abi/libonnxruntime.so"; sherpa="$tmp/lib/$abi/libsherpa-onnx-c-api.so"
    ort_syms="$([ -f "$ort" ] && "$READELF" -W --dyn-syms "$ort" || true)"
    sherpa_syms="$([ -f "$sherpa" ] && "$READELF" -W --dyn-syms "$sherpa" || true)"
    if grep -q "OrtGetApiBase@@$WANT\b" <<<"$ort_syms" && grep -q "UND OrtGetApiBase@$WANT\b" <<<"$sherpa_syms"; then
      echo "[ort-check] ok: $(basename "$apk") $abi has OrtGetApiBase@$WANT"
    else
      echo "[ort-check] FAIL: $(basename "$apk") $abi lacks OrtGetApiBase@$WANT (re-run npm install to redo the native swap)" >&2
      fail=1
    fi
  done
  rm -rf "$tmp"
done
exit $fail
