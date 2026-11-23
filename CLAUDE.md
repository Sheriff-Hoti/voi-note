# voi-note

Android voice-notes app (React Native + Expo): speak, transcribe on-device, save as a text note.

## Toolchain

Pinned in `mise.toml` (Java 17, Node 24, Android SDK). The agent shell is not mise-activated: run node, java, gradle and adb through `mise exec --`. To build, install or inspect the app on the phone, use the `device-check` skill.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for Sheriff-Hoti/voi-note (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
