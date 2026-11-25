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
2. **Wake the phone.** `adb shell "dumpsys window | grep isKeyguardShowing"`: `true` means locked (a screenshot then comes back black or shows only the clock), so ask the user to unlock. Then keep the screen on for the session: save `adb shell settings get global stay_on_while_plugged_in` and run `adb shell svc power stayon usb`. Done when the keyguard is down and stay-on is set.
3. **Build and install.** `npx expo run:android --device <serial>`, awaited with a short timeout so it moves to the background. It builds only arm64 (about 1.5 min incremental; a raw `./gradlew assembleDebug` builds every ABI and takes about 11 min). Done when its output shows `[ort-check] ok`, then `Waiting on http://localhost:8081` (Metro stays up), `Installing …app-debug.apk`, and last `› Opening exp+voi-note://… on <device>`. Until that `Opening` line, the install is still running and restarts the app under you.
   - `android/` is generated and gitignored. When `package.json` gained a native dependency or `app.json` a config plugin since the last build, regenerate it first: `npx expo prebuild --platform android --no-install` and `rm -rf android/build/generated/autolinking`. A stale `android/` builds fine, then the app fails with `Cannot find native module '…'`.
4. **Open the app on Metro.** A cold start lands on the dev-client launcher instead of the app, so force-stop it and open it by deep link over the cable:
   ```sh
   adb shell am force-stop com.voinote.app
   adb reverse tcp:8081 tcp:8081
   adb shell am start -a android.intent.action.VIEW -d "exp+voi-note://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.voinote.app
   ```
   The first open shows the dev menu sheet; Back closes it by leaving the app, so re-run the deep link. Done when a screenshot shows the app's own screen.
5. **Inspect and drive.**
   - Before tapping by coordinates, check the app is in front: `adb shell "dumpsys activity activities | grep mResumedActivity"` names `com.voinote.app`. Back on the notes list leaves the app, and a blind tap then lands on the launcher.
   - Screen state as text (cheap): `adb shell rm -f /sdcard/ui.xml; adb shell uiautomator dump /sdcard/ui.xml; adb shell cat /sdcard/ui.xml`, then read the `text=` and `bounds=` attributes; tap the centre of a bounds box with `adb shell input tap x y`. While anything animates (a progress bar) the dump fails and writes no file: treat a missing file as "animating" and tap by screenshot coordinates instead. The Recording screen's timer always animates, so its dump always fails.
   - Speech needs the user's voice. Ask with AskUserQuestion what to say (pauses, a 15 s run without pausing, silence) and to pick Ready; then tap the mic and take a screenshot every 5 s while they talk, so the text so far is on record. Let the user tap Stop, or tap it yourself for a silent Recording.
   - Screenshot (for how it looks): `adb exec-out screencap -p > <scratchpad>/x.png`, then Read the PNG. It is shown 923 px wide; device pixels are those × 1080/923.
   - Android dialogs on this phone show their buttons in capitals (`DELETE`, `CANCEL`).
   - Network states: `adb shell svc wifi disable` leaves mobile data only; adding `adb shell cmd connectivity airplane-mode enable` gives no network at all (airplane mode alone keeps Wi-Fi on). Ask the user before any step that downloads over mobile data. Restore Wi-Fi and airplane mode afterwards.
   - JS logs: read Metro's output file (the background task's `outputPath`) with `tail -c` or `grep`; it holds the whole build log (megabytes), and a whole-file read times out the Read hook. At launch the app logs `[sherpa-runtime] sherpa-onnx loaded`; a broken native swap logs `[sherpa-runtime] sherpa-onnx failed to load`. Each Stop logs `[voice-notes] Stop took N ms` (the acceptance target is 1.5 s or less).
   - Launch timing (the "< 1 s from the icon" target) needs a release build: `npx expo run:android --variant release --device <serial> --no-bundler`. It builds every ABI (about 10 min), so start it early. Launch as the icon does: `adb shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.voinote.app/.MainActivity`, and measure in `adb logcat -v time` from `START u0` to `[voice-notes] Instant Capture recording`. A debug build's timing is the dev bundle's, not the app's.
   - Background behaviour: Samsung freezes the app 1–2 min after it leaves the screen, and React Native's timers stop there (ADR 0004). Shorten any duration under test to 20–30 s and watch logcat first; wait out a real duration only once that works.
   - Memory: read both `TOTAL PSS` and `TOTAL SWAP PSS` from `adb shell dumpsys meminfo com.voinote.app`. A frozen app's memory moves to swap, which looks like a release in PSS alone.
   - Before a wait longer than a minute (a build, a background timer), tell the user what is running and about how long it takes.
   - Native crashes: `adb logcat -d -b crash`. `/proc/<pid>/maps` cannot show which `.so` files loaded: they are mapped straight from `base.apk`.
   - Theme: `adb shell cmd uimode night no|yes` switches system light/dark without the user. Restore the user's mode afterwards (`adb shell cmd uimode night` shows it).
6. **Clean up.** Stop the `expo run:android` background task (Metro), run `adb reverse --remove tcp:8081`, and put back the saved `stay_on_while_plugged_in` value (`adb shell settings put global stay_on_while_plugged_in <saved>`). Done when nothing listens on port 8081 and the setting reads its saved value.
