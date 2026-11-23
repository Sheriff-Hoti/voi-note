#!/usr/bin/env bash
# Swap react-native-sherpa-onnx's bundled sherpa-onnx (1.12.35) for upstream k2-fsa v2.0.3.
# The library's Gradle build checks third_party/sherpa-onnx-prebuilt/android/ FIRST ("THIRD_PARTY" stage),
# so we drop the upstream .so files, C headers and Kotlin classes.jar there.
# ONNX Runtime must be swapped too: sherpa 2.0.3 needs OrtGetApiBase@VERS_1.28.2 (k2-fsa's own ORT build,
# not on Maven), the library ships VERS_1.25.0 -> "cannot locate symbol OrtGetApiBase" crash at startup.
# So third_party/onnxruntime_prebuilt/android gets k2's libonnxruntime.so plus the library's
# libonnxruntime4j_jni.so (needed only to satisfy the Gradle check; it can't load against 1.28.2, which
# only breaks the library's ORT-Java acceleration probes, unused here).
# Runs as npm postinstall. No Kotlin is written or patched. See docs/adr/0002.
set -euo pipefail
V=2.0.3
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="${SHERPA_CACHE:-$HERE/.sherpa-cache}"
LIB="$HERE/node_modules/react-native-sherpa-onnx"
DST="$LIB/third_party/sherpa-onnx-prebuilt/android"
[ -d "$LIB" ] || { echo "[sherpa-$V] library not installed yet, skipping"; exit 0; }
mkdir -p "$CACHE"
AAR="$CACHE/sherpa-onnx-$V.aar"
[ -f "$AAR" ] || curl -fsSL -o "$AAR" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$V/sherpa-onnx-$V.aar"
for h in c-api.h cxx-api.h; do
  [ -f "$CACHE/$h" ] || curl -fsSL -o "$CACHE/$h" "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v$V/sherpa-onnx/c-api/$h"
done
rm -rf "$DST" && mkdir -p "$DST/java" "$DST/include/sherpa-onnx/c-api"
TMP="$(mktemp -d)"; unzip -q "$AAR" -d "$TMP"
for abi in arm64-v8a armeabi-v7a x86 x86_64; do
  mkdir -p "$DST/jni/$abi"
  cp "$TMP/jni/$abi"/libsherpa-onnx-{jni,c-api,cxx-api}.so "$DST/jni/$abi/"
done
cp "$TMP/classes.jar" "$DST/java/classes.jar"
cp "$CACHE"/c-api.h "$CACHE"/cxx-api.h "$DST/include/sherpa-onnx/c-api/"
# Only libonnxruntime4j_jni.so comes from this AAR (see header); libonnxruntime.so itself is k2-fsa 1.28.2 from $AAR.
JNI_SHIM_V=1.24.4-qnn2.43.1.260218-1
ORT_AAR="$CACHE/onnxruntime-$JNI_SHIM_V.aar"
[ -f "$ORT_AAR" ] || curl -fsSL -o "$ORT_AAR" "https://xdcobra.github.io/maven/com/xdcobra/sherpa/onnxruntime/$JNI_SHIM_V/onnxruntime-$JNI_SHIM_V.aar"
ORT_DST="$LIB/third_party/onnxruntime_prebuilt/android"
rm -rf "$ORT_DST"; TMP2="$(mktemp -d)"; unzip -q "$ORT_AAR" 'jni/*' -d "$TMP2"
for abi in arm64-v8a armeabi-v7a x86 x86_64; do
  mkdir -p "$ORT_DST/jni/$abi"
  cp "$TMP/jni/$abi/libonnxruntime.so" "$ORT_DST/jni/$abi/"
  cp "$TMP2/jni/$abi/libonnxruntime4j_jni.so" "$ORT_DST/jni/$abi/"
done
rm -rf "$TMP" "$TMP2"
# Clear any stale extracted prebuilts so the THIRD_PARTY stage re-runs.
rm -rf "$LIB/android/build/prebuilt-downloads" "$LIB/android/src/main/jniLibs"/*/libsherpa-onnx-*.so "$LIB/android/src/main/cpp/include/sherpa-onnx" 2>/dev/null || true
echo "[sherpa-$V] installed upstream sherpa-onnx $V into $DST"
