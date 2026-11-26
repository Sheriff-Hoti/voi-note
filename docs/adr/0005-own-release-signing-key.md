# Release APKs are signed with our own key, built by GitHub Actions

Release APKs are signed with a voi-note release key, not the Expo debug key that every `expo prebuild` project shares. The key was generated with `keytool` (PKCS12, RSA 4096, alias `voi-note`, certificate SHA-256 `6586be9c…594f2b`) and lives outside the repo, in `~/.config/voi-note/` with its random password in a file next to it. The user keeps a backup of both. GitHub Actions gets it through four repo secrets (`RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS`, `RELEASE_KEY_PASSWORD`). The release workflow builds an arm64-v8a APK and fails unless the APK's certificate matches the release key. A `vX.Y.Z` tag attaches it as `voi-note.apk` to a normal GitHub Release, so the latest-download link always serves the newest version (ticket #8).

Android only installs an update over an app signed with the same key, and changing the key means uninstalling first, which deletes the Notes and the Speech Model on the phone. So the key is chosen once, before the first public release. A debug key fails both tests. Its private key is public, so anyone could sign an "update" to voi-note. And a later switch to our own key would cost every installed copy its Notes.

## Considered Options

- **Keep the Expo debug key**: no secrets to manage, but no real signing, and moving off it later costs every user an uninstall.
- **EAS Build with an EAS-managed key**: the spec's original plan. It puts the key and the builds in Expo's service and its free-tier queue, for an app that already builds locally. Dropped.
- **Google Play App Signing**: not relevant; voi-note is a sideloaded APK, not on Play.

## Consequences

- Losing the keystore or its password means no further update can install over the existing app: every user would have to uninstall, losing their Notes. Back up both files together.
- The phone's existing build (signed with the debug key) has to be uninstalled once before the first Release installs.
- Local builds are unchanged: `expo run:android` debug and release builds are signed with the debug key unless `VOI_NOTE_KEYSTORE` and its three companion variables are set (`plugins/with-android-build.js`). A locally built APK cannot be installed over a Release, or the other way round, without an uninstall.
- CI and Release APKs are arm64-v8a only; local debug builds keep x86_64 for the emulator.
- The versionName and versionCode come from the tag (`scripts/release-version.js`: `vX.Y.Z` gives `X*10000 + Y*100 + Z`), so minor and patch stay at 0–99. Builds from `main` or a manual run keep `app.json`'s versionCode 1, below every Release, so a Release installs over them.
