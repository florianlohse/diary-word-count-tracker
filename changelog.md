# Changelog

All notable changes to Diary Word Count Tracker are documented here.

## [Unreleased]

### Added

- **Footer marker** setting (`##` by default, matching this vault's actual footer convention): everything from that heading line onward — including the heading itself — is excluded from `words_written`. Matched as a whole line, exactly, after trimming whitespace, so an empty `## ` heading doesn't wrongly catch a real `## Reflections`-style heading elsewhere in the note. Leave blank to disable. Ported from `diary-metrics-tracker`'s `normalizeFooterMarker`/`stripFooter`, which stayed on that plugin's more general (footer marker off by default) generic-vault-safe behavior.
- **Target folder** setting (`PRIVATE/Diary` by default, this vault's original hardcoded scope): the previous hardcoded `SCOPE_FOLDER` constant is now a configurable, defensively-normalized setting (leading/trailing slashes and whitespace stripped; blank = whole vault). Existing installs keep tracking exactly the same folder with no action needed. Ported from `diary-metrics-tracker`'s `normalizeScopeFolder`/`inScope(path, scopeFolder)`.
- README, MIT license, and a `src/core.js` + `tests/core.test.js` vitest suite (42 tests) covering all of the above, plus `esbuild.config.mjs`/`package.json` build tooling — the repo is now structured for public/open-source use.

### Fixed

- Editor scroll position and cursor jumping to the top of the note on every automatic update (iOS). Root cause: `processFrontMatter`'s disk write re-syncs the active editor and resets its view state. Fix: capture cursor/scroll immediately before the write, restore ~50ms after, only if the same file is still active.

## [1.0.0] — 2026-08-07

### Added

- Idle-gated periodic polling: checks the active file every `pollIntervalSec` (default 30s), writes `words_written` to frontmatter only if idle for `idleThresholdSec` (default 4s) since the last keystroke.
- Settings tab exposing poll interval and idle threshold as live-editable fields; poll interval changes restart the timer immediately.
- Compare-before-write guard — skips the frontmatter write if the count is unchanged.
- Frontmatter-stripped word counting, scoped to `PRIVATE/Diary`.

### Superseded pre-release designs (not separately versioned)

- Manual Meta Bind button + QuickAdd macro (interim workaround, replaced).
- Update-on-note-close/switch via `file-open` event — replaced after identifying that force-quitting iOS Obsidian while still in the open note skips the trigger entirely.
