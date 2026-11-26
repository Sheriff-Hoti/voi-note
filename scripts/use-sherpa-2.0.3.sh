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
# Every download is pinned by SHA-256 and checked on each run, cached or not: these files end up inside the
# signed release APK. The sherpa-onnx AAR's hash matches GitHub's release asset digest for v2.0.3.
fetch() { # url, file, sha256
  [ -f "$2" ] || curl -fsSL -o "$2" "$1"
  echo "$3  $2" | sha256sum -c --quiet - || { rm -f "$2"; echo "[sherpa-$V] checksum mismatch for $(basename "$2"); removed it, re-run npm install" >&2; exit 1; }
}
AAR="$CACHE/sherpa-onnx-$V.aar"
fetch "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$V/sherpa-onnx-$V.aar" "$AAR" 4c766e2e74c9d33d595338c21fe3b305c73ba45d47e96a235675c33142a2ec50
fetch "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v$V/sherpa-onnx/c-api/c-api.h" "$CACHE/c-api.h" 1f738de63a206328253ff471edda96b011fa1bd6f2a028f82967a7761abc2edd
fetch "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v$V/sherpa-onnx/c-api/cxx-api.h" "$CACHE/cxx-api.h" 6fb6afc866784836a08832c611c867153f185b0a65fa418f743fcc3323d7dd7f
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
fetch "https://xdcobra.github.io/maven/com/xdcobra/sherpa/onnxruntime/$JNI_SHIM_V/onnxruntime-$JNI_SHIM_V.aar" "$ORT_AAR" 6cd21ddaf1dc2e1297a33af39556b432adeedc81600c34301c29f453d4c4b81d
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
