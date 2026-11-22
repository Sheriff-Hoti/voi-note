# Patterns borrowed from Orca's speech feature (research, 2026-11-22)

Read from the installed Orca desktop app (minified). Orca now runs transcribe.cpp/GGUF; the patterns are engine-agnostic.

## Download
- Catalog entry: id, label, language, files [{name, url, sizeBytes, sha256}], sizeBytes, sampleRate 16000, streaming, replacedBy (retirement → "needs update").
- URLs pinned to a Hugging Face commit.
- Download into `<modelDir>.partial/`; resume with `Range`, accept 206 only if Content-Range start matches; on bad 206/416 delete and retry.
- Backoff 1/2/4 s, max 4 consecutive no-progress attempts (progress resets), 120 s stall timeout, HTTPS-only redirects (max 5), honour Retry-After.
- Progress throttled to 1% steps.
- SHA-256 per file after it completes (read back from disk). "Ready" at startup = sizes match (no rehash).
- Swap: rename current → .previous, .partial → final, rollback on failure, delete .previous.
- Cancel via abort; delete refused while model loaded.
- Orca gaps to improve on: no disk-space check; .partial deleted on restart (no resume across app kill).

## Initialization
- Prewarm on startup and on focus; failed prewarm remembered per model (no retry loop).
- Engine isolated in its own process; 60 s load timeout.
- Warm-up: decode silence once (1.5 s streaming, 0.5 s offline).
- Threads: min(cores, 8, max(4, floor(cores/2))).
- Idle unload choices 0/5/15/60/never minutes, default 15.
- GPU failure → respawn on CPU and replay buffered audio; failure remembered per OS/lib version.

## Audio / latency
- Start mic first, buffer PCM in a capped ring (60 s / 8 MiB), flush to engine when ready. Keep raw audio (up to 600 s) so a failed engine can retry without re-recording.
- 16 kHz mono, 100 ms frames; echo cancellation / noise suppression / AGC on.
- Streaming: emit partial only on change; commit text unchanged for 2 s; restart stream at 25 s (or 20 s at a ≥0.15 s pause) to bound state.
- Offline models: Silero VAD phrase cuts (0.6 s pause, 0.4 s pre-roll, hard cut at 30 s at the quietest point).
