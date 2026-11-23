---
name: device-check
description: Run and inspect voi-note on the USB-connected Galaxy A54. Use to verify a change on the phone, screenshot a screen, read app logs, or check light/dark mode.
---

# Device check (Galaxy A54)

The test phone is a Galaxy A54 (arm64). Prefer it to the emulator: the AVD is heavy on this PC's RAM and has segfaulted under `-gpu swiftshader_indirect`.

Run every command through `mise exec --` (the agent shell is not mise-activated, and adb lives in `~/Android/Sdk/platform-tools`). Keep each call small: the Orca agent hook times out on long or concurrent calls.

## Steps

1. **Connect.** `adb devices -l` lists the phone as `device`; pass that serial to `--device` below. Done when it does. Keep the serial out of files, commits and issues.
   - Empty list and `lsusb` shows no Samsung device, or the kernel log has `error -71`: the cable is bad; ask the user to swap it.
   - Samsung device in `lsusb` but adb empty: USB debugging is off (Settings → Developer options → Debugging), or Auto Blocker blocks it. Ask the user.
   - `unauthorized`: ask the user to tap Allow on the phone.
2. **Build and install.** `npx expo run:android --device <serial>`, awaited with a short timeout so it moves to the background. It builds only arm64 (about 1.5 min incremental; a raw `./gradlew assembleDebug` builds every ABI and takes about 11 min). Done when its output shows `[ort-check] ok` and `Installing …app-debug.apk`, followed by `Waiting on http://localhost:8081` (Metro stays up).
3. **Open the app on Metro.** A cold start or `am force-stop` lands on the dev-client launcher instead of the app, so open it by deep link over the cable:
   ```sh
   adb reverse tcp:8081 tcp:8081
   adb shell am start -a android.intent.action.VIEW -d "exp+voi-note://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.voinote.app
   ```
   The first open shows the dev menu sheet; Back closes it by leaving the app, so re-run the deep link. A locked screen shows only the clock: ask the user to unlock. Done when a screenshot shows the app's own screen.
4. **Inspect.**
   - Screenshot: `adb exec-out screencap -p > <scratchpad>/x.png`, then Read the PNG.
   - JS logs: read Metro's output file (the background task's `outputPath`). At launch the app logs `[sherpa-runtime] sherpa-onnx loaded`; a broken native swap logs `[sherpa-runtime] sherpa-onnx failed to load`.
   - Native crashes: `adb logcat -d -b crash`. `/proc/<pid>/maps` cannot show which `.so` files loaded: they are mapped straight from `base.apk`.
   - Theme: `adb shell cmd uimode night no|yes` switches system light/dark without the user. Restore the user's mode afterwards (`adb shell cmd uimode night` shows it).
5. **Clean up.** Stop the `expo run:android` background task (Metro) when done. Done when nothing listens on port 8081.
