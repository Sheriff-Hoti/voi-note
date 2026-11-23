# Handoff: voi-note speech prototype — results (2026-11-23)

Follow-up to `/tmp/voi-note-prototype-handoff.md`. The prototype is done; both questions are answered.
Next: `/to-spec`, then `/to-tickets`, then `/implement` or `/implement-spec`.

## Verdicts

1. **Engine:** Parakeet Unified EN 0.6B runs on the Galaxy A54 from Expo RN through **react-native-sherpa-onnx 0.4.4**,
   with no hand-written Kotlin, **but only after swapping two native parts at install time**:
   sherpa-onnx → **2.0.3** (k2-fsa AAR) and ONNX Runtime → **k2-fsa's 1.28.2** (from the same AAR).
   With the library's own ORT (1.25) the app aborts at startup: `dlopen failed: cannot locate symbol OrtGetApiBase`
   (sherpa 2.0.3 needs `OrtGetApiBase@VERS_1.28.2`; ORT symbols are version-locked; Maven has 1.28.0/1.29.0 but not 1.28.2).
   The custom Kotlin fallback (`~/voi-note-prototype`) is **not needed**. It was not touched.
2. **Mode:** **after-Stop wins; Live is dropped.** v1 ships after-Stop with the **offline (non-streaming)** export,
   decoded **in chunks during the Recording** (cut at pauses), so Stop only waits for the last chunk.

## Measurements (A54, 4 threads, EAS release build)

| | Result | Target |
|---|---|---|
| Recording starts (first mic audio after JS start) | 0.31–0.50 s | < 1 s ✅ |
| Offline model ready (load + warm-up on 0.5 s silence) | 5.1–6.2 s + 0.18 s = **5.3–6.4 s** | < 5 s ❌ (audio is buffered meanwhile; nothing lost) |
| Transcript ready after Stop, whole Recording at once | 6.2–9.9 s for 49–63 s (RTF 0.13–0.16) | < 5 s ❌ |
| Transcript ready after Stop, **chunked** | **2–3 ms** (trailing pause); worst case ≈ max chunk × 0.12 | < 5 s ✅ |
| Chunked decode speed / max background lag | RTF 0.11–0.12 / 0.8–2.9 s | — |
| Live (560 ms streaming export) | RTF 2.7–3.9 on A54; lag 12–30 s | lag < 1.5 s ❌ |
| Heat | not warm after ~1 min runs | 5-min run not done |
| APK | 59 MB arm64-only (125 MB with x86_64) | — |

Cross-check on the PC (i5-9400F, sherpa-onnx 2.0.3 Python, 4 threads): streaming RTF 2.3–3.2, offline RTF 0.08–0.11,
same text. So Live's cost is the streaming path itself (~30× the offline cost), not the phone.

**Not measured:** peak RAM (expect ~1 GB PSS for one model; the emulator showed 1.07 GB with the streaming model),
5-minute heat, 2 vs 6 threads, the 25 s hard cut (never fired: normal breaths are ≥ 0.6 s pauses).

Accuracy on the user's own speech: good. Chunked text has the same words as the whole-Recording decode and better
punctuation/capitals (whole-Recording punctuation fades after the first sentences). Chunk cuts mid-sentence leave
artefacts: "this time I. Will not stop", "the Previous port".

## Decisions to carry into the spec (new)

- **Engine:** react-native-sherpa-onnx + install-time swap to sherpa-onnx 2.0.3 / ORT 1.28.2 (worth an ADR: it replaces
  the deferred "library vs custom Kotlin module" ADR). Risk: any library upgrade can undo the swap; pin the library
  version and verify `OrtGetApiBase@VERS_1.28.2` in the built APK.
- **Speech Model shipped:** the **offline** Parakeet Unified EN int8 export only (~663 MB). The streaming export is not needed.
- **No Live mode.** Text still appears a few seconds behind speech as chunks finish ("chunked text so far").
- **Chunking:** cut after **0.6 s** of pause; **hard cut at 12 s** (user's choice, was 25 s in the prototype) at the
  quietest 100 ms of the last few seconds; skip silent chunks. Worst-case wait at Stop ≈ 12 s × 0.12 ≈ 1.5 s.
- **Join cleanup:** when joining chunks, if the previous chunk doesn't end in `.?!`, drop a trailing period the model
  added at the cut and lowercase the next chunk's first word (except "I"). Not built or tested yet.
- **VAD:** the library's VAD module is an unimplemented placeholder (`initializeVAD` throws). The prototype used a JS
  energy detector (minimum-tracking noise floor, threshold floor × 2.5 + 0.003, 100 ms chunks). Spec must choose:
  keep the energy detector or add a real VAD (e.g. Silero) from elsewhere.
- **Release build:** Expo SDK 58 enables R8 by default; the prototype turned it off. If R8 is turned back on, add
  `-keep class com.k2fsa.sherpa.onnx.** { *; }` (sherpa's JNI reads those fields by name; the library ships no rule).
- **Model files:** the in-app download writes into the app's own external files dir, which works. Files placed there with
  `adb push` are owned by `shell` and the app can't read them (scoped storage); only matters for dev/testing.
- **Threads:** 4 (A54: 4× Cortex-A78 + 4× Cortex-A55). 2/6 not compared.

## v1 decisions from the earlier grilling (still unrecorded elsewhere — copied unchanged)

- **Who it's for:** the user only; sideloaded APK; English only.
- **Instant Capture:** a fresh launch from the icon, with the Speech Model installed, starts a Recording right away.
  Mic starts first and audio is buffered while the model loads. Coming back to an already-open app does not record.
- **Ending a Recording:** Stop opens the new Note; its Transcript fills in when ready. X = Discard (no Note, audio
  deleted) after a ~5 s Undo snackbar. Hard cap of 5 minutes, no warning. An empty Transcript behaves like Discard.
- **Note:** raw Transcript + timestamp, no title. List shows date/time and first line. Actions: list, view, edit
  (replaces text, original not kept), delete (confirm; deletes audio too), share (text only, Android share sheet).
  Back gesture returns to the list; a big mic button there starts a new Recording.
- **Audio:** keep a compressed copy (AAC/Opus, ~0.2 MB/min); delete the WAV after transcription. (The library's
  FFmpeg-based `convertAudioToFormat` can do AAC/Opus; untested.)
- **Pending Note:** saved at Stop; if the app dies before the Transcript is ready, transcribe on next launch.
- **Storage:** local only, SQLite via expo-sqlite. No account, no cloud.
- **Model lifecycle:** loaded on a background thread in-app; prewarmed at launch; released after 5 min in background.
  (Prototype: native load does not block JS — max JS stall during load 25–42 ms.)
- **Setup screen:** mic permission; one model row (size, Download, MB progress, resume after app kill via `.partial`,
  free-space check, sha256 check, delete); pinned Hugging Face file; warn on mobile data but allow.
  Pinned source used by the prototype: `huggingface.co/csukuangfj2/sherpa-onnx-nemo-parakeet-unified-en-0.6b-int8-non-streaming`
  @ `8c3a10fb13408c7a7054f6898958bf1c64a8d6c7` (encoder 654040552 B, decoder 7257753 B, joiner 1735860 B, tokens 8952 B).
- **UI:** React Native Reusables, default theme, follows system light/dark.
- **Not in v1:** search, tags, sync, LLM cleanup, Albanian, Play Store.

## Where things are

- Prototype: worktree `~/voi-note-prototype-rn`, branch `prototype/speech-engine-rn-sherpa`
  (local, **not pushed**). App in `speech-prototype-rn/`; results in its `README.md`; the native swap is
  `speech-prototype-rn/scripts/use-sherpa-2.0.3.sh` (npm postinstall); the chunking code is in `App.tsx`
  (`vadStep` / `closeSeg` / `drainSegs`). The prototype still uses a 25 s hard cut and has no join cleanup.
- Main repo `~/voi-note` (`main`) is unchanged.
- Tooling: Android SDK at `~/Android/Sdk` (worktree `mise.toml` points there); AVD `voinote-proto-api35`
  (Android 35, x86_64, in `~/.android/avd`; usable from Orca's emulator pane); EAS project
  `@sheriff-hoti/speech-prototype-rn` (preview profile builds an installable APK).
- Kotlin fallback worktree `~/voi-note-prototype` (branch `prototype/speech-engine`): untouched, now unneeded.

## Next steps

1. `/to-spec` with the decisions above. Record an ADR for the engine (react-native-sherpa-onnx + 2.0.3/ORT 1.28.2 swap).
2. When the implementation issue exists, add a pointer to branch `prototype/speech-engine-rn-sherpa` (push it first
   if the issue should link to it) and the verdicts above (prototype skill rule).
3. Optional before or during implementation: 5-minute heat run, peak RAM, 2 vs 6 threads.
