# English only, transcribed by Parakeet Unified EN

voi-note v1 transcribes English only, using NVIDIA Parakeet Unified EN 0.6B (sherpa-onnx int8 export) as its single Speech Model. We chose it over Parakeet TDT v2/v3 and Whisper because one model covers both live (streaming) and after-Stop transcription with near-identical accuracy (avg WER 5.91 offline, 6.52 at 0.56 s latency, vs 69.55 for TDT v2 at the same latency), which lets the prototype compare the two modes without changing models.

## Considered Options

- **Parakeet TDT v2**: English, slightly worse offline, unusable for streaming.
- **Parakeet TDT v3**: 25 European languages, but not Albanian, and offline only.
- **Whisper (via whisper.rn)**: supports Albanian, but quality on phone-sized models is weak and it has no true streaming.

## Consequences

Albanian (or any non-English speech) is out of scope for v1. Adding it later means a second Speech Model (likely Whisper), not a setting.
