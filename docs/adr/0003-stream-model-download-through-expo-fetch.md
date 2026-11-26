# Model download: stream through expo/fetch, append with react-native-fs

The model installer downloads by streaming the HTTP body through `expo/fetch` (which ships with `expo`) and appending each piece to the `.partial` file with react-native-fs `appendFile`. This is the only option that lets the installer see the response status and `Content-Range` **before** any byte is written, which a safe resume needs: a 206 is accepted only when `Content-Range` starts at the byte the `.partial` ends at, and a bad 206 or a 416 restarts the file. All of that logic lives in the installer (seam 2); the adapter in `src/model-installer/adapters.ts` only moves bytes. Measured on the Galaxy A54 at about 20 MB/s on Wi-Fi, resuming correctly after the app was force-stopped (ticket Sheriff-Hoti/voi-note-archive#4, PR Sheriff-Hoti/voi-note-archive#14).

## Considered Options

- **react-native-fs `downloadFile`**: native and fast, and its `begin` callback shows the headers first, but on Android it always opens the target with `FileOutputStream(dest)`, which overwrites. It cannot resume.
- **expo-file-system `DownloadTask` (`resumeAsync` / `fromSavable`)**: native, sends `Range` and appends on a 206, but it never checks `Content-Range` and appends before JS sees the response. A bad 206 would corrupt the `.partial` silently, caught only by the SHA-256 after the whole file is downloaded.
- **A hand-written Kotlin downloader**: full control, but ADR 0002 keeps the app free of native code of our own.

## Consequences

- Every byte passes through JS. The adapter merges body pieces up to 256 KB before appending, to keep native calls down; the installer's 120 s stall timer resets per merged piece, so a connection slower than about 2 KB/s counts as stalled.
- `expo/fetch` follows Hugging Face's redirect to its CDN and keeps the `Range` header; the resume test on the phone is what shows this, the seam tests can't.
- Free space comes from `RNFS.getFSInfo()`; mobile data from `expo-network`.
