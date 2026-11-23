# On-device speech-to-text for voi-note (research, 2026-11-22)

Gathered during grilling from primary sources. Verify versions before relying on them.

## Model: NVIDIA Parakeet Unified EN 0.6B
- One English RNN-T model that does both offline (whole utterance) and streaming (live partials); weights shared. https://huggingface.co/nvidia/parakeet-unified-en-0.6b
- Avg WER (HF Open ASR sets): offline 5.91 (tdt-0.6b-v2: 6.04); 1.12 s latency 6.29 (v2: 22.83); 0.56 s 6.52 (v2: 69.55); 0.16 s 8.44.
- Punctuation + capitalization. License: NVIDIA Open Model License (commercial OK).
- sherpa-onnx int8 packages: `...-int8-non-streaming` and `...-int8-streaming-{240ms,560ms,1120ms}`, ~501 MB each (tar.bz2); encoder ~624–654 MB extracted. https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
- Parakeet v2/v3 do not support Albanian; Whisper does (weakly at small sizes).

## Runtime options on Android / React Native
- **sherpa-onnx v2.0.2+ AAR via a small custom Expo Kotlin module** — recommended prototype path. Streaming Unified support landed in 1.13.2; streaming fix #4133 needs >= 2.0.2. Kotlin `OnlineRecognizer` + `OnlineTransducerModelConfig` should detect it via decoder metadata `streaming_model_type=nemo_parakeet_unified_streaming` (unverified on device). Greedy search only (#4131).
- XDcobra/react-native-sherpa-onnx — pins sherpa 1.12.35 (too old); version overridable; issue #112 Expo SDK 54 + New Arch load failure. Fallback.
- whisper.rn — Parakeet TDT v3 only, offline, CPU. Not usable for Unified.
- handy-computer/transcribe.cpp (what Orca uses) — supports Unified streaming, no Android build/bindings.
- react-native-executorch — Whisper/Moonshine only, needs Expo SDK 55+ dev build.

## Device
Target: Samsung Galaxy A54 (Exynos 1380, 8 GB). No Snapdragon NPU paths; expect CPU inference. No published mid-range benchmarks — the prototype must measure cold load, real-time factor, heat.

## Storage
16 kHz mono: WAV ~1.9 MB/min; AAC/Opus 24–32 kbps ~0.2 MB/min.

## Distribution
Personal sideloaded APK; model downloaded on first run. (Play: base module 500 MB cap; would need Play Asset Delivery.)
