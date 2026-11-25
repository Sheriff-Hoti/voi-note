# voi-note

Android app (Expo React Native) that turns a spoken Recording into a text Note, transcribed on the phone.

## Toolchain

Pinned in `mise.toml` (Java 17, Node 24, Android SDK). The agent shell is not mise-activated: run node, java, gradle and adb through `mise exec --`. To build, install or inspect the app on the phone, use the `device-check` skill.

## Workflow: one ticket, one pull request

The user reviews every change before it reaches `main`. Never commit to `main`, push to it, or merge into it.

- Before starting a ticket (e.g. `/implement #3`): `git switch main && git pull`, then create a branch `ticket/<issue-number>-<short-slug>` (e.g. `ticket/3-model-download`). Commit all work there.
- Write `Refs #<n>` in commit messages, not `Closes #<n>`. Closing happens when the PR merges.
- When the ticket is done (tests, lint and the device check pass), push the branch and open a PR with `gh pr create`. Its body starts with `Closes #<n>`, then: what changed, how it was verified (on the phone too), and anything the reviewer should look at closely.
- Stop after opening the PR. Merge only when the user says to, once CI passes; leave the issue to close with the merge, and leave the next ticket for the user to start.
- Changes outside a ticket (docs, tooling, retro fixes) follow the same rule, on a `chore/<slug>` branch.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for Sheriff-Hoti/voi-note (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Coding standards

`CODING_STANDARDS.md`: the judgement calls `/code-review` checks (tests, language, ADRs).

### Prototype evidence

Before a ticket that touches speech, chunking, or timing in the background, read `docs/prototypes/` and `docs/adr/0004-release-speech-model-on-background.md`: the A54 behaviour and measurements that ticket decisions rest on.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
