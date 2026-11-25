# Coding standards

Applied in review (`/code-review`). Linting, formatting and types are enforced by `npm run check`; these are the judgement calls it can't make.

## Tests

- **Behaviour through the interface.** A test drives a module only through its public interface, at an agreed seam (spec #1: seam 1, the voice-notes core; seam 2, the model installer), with the module's ports replaced by fakes.
- **Assert what is observable from outside the module:** the Notes in the repository, emitted state, files created or deleted, download status, and what a fake saw arrive at a port (the bytes written, the byte offset a request asked for with `Range`, the time between requests on the fake clock). Leave out internals: chunk-boundary bookkeeping, private helpers, and which internal collaborator ran in what order. The test: it survives a rewrite of the module's internals that keeps its behaviour.
- **Expected values come from an independent source:** a literal, a worked example, or the spec. Not a recomputation of what the code does.
- **Fakes live next to their ports** (for example `src/model-installer/fakes.ts`) and stay scriptable, so a test states the scenario (`offline`, `stallAfter`, a bad `Content-Range`) instead of building it.
- **Time-based behaviour** (backoff, timeouts, the Undo window, the 5-minute cap) runs on Jest's fake timers, never real waits.

## Language

- Names in code, tests and UI text use the terms in `GLOSSARY.md` (Note, Recording, Transcript, Speech Model, Pending Note, Instant Capture, Discard), not the synonyms it lists to avoid.

## Decisions

- A change that goes against an ADR in `docs/adr/` says so in the PR, or comes with a new ADR.
