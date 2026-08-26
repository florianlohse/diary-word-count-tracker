# Diary Word Count Tracker

Obsidian plugin. Writes a `words_written` frontmatter field to notes in a
diary vault, kept up to date on an idle-gated poll loop.

## What it does

Every `pollIntervalSec` (default 30s), if the active note is under the
configured **Target folder** (defaults to `PRIVATE/Diary`, this vault's
original scope — see below) and it's been at least `idleThresholdSec`
(default 4s) since your last keystroke:

1. Read the note, strip its YAML frontmatter and (optionally) an automated
   footer, and count the remaining words.
2. If that count differs from the note's current `words_written`, write the
   new value via Obsidian's `processFrontMatter` API.

The idle gate exists to avoid racing Obsidian's own autosave of the editor
buffer — writing frontmatter to a note that still has unsaved edits in its
open editor can trigger Obsidian's "modified externally, merging changes"
conflict path.

Cursor and scroll position are captured immediately before the write and
restored ~50ms after, since `processFrontMatter`'s disk write re-syncs the
active editor and would otherwise reset both to the top of the note.

## Settings

| Setting | Default | What it controls |
| --- | --- | --- |
| Target folder | `PRIVATE/Diary` | Vault-relative folder tracked (with subfolders). Blank = whole vault. |
| Poll interval | 30s | How often the active note is checked. |
| Idle threshold | 4s | Minimum keystroke-idle time before a poll tick is allowed to write. |
| Footer marker | `##` | Excludes an automated footer from the word count (see below). |

### Target folder input handling

The target folder value is normalized defensively rather than matched
literally: leading/trailing whitespace and slashes are stripped (so
`PRIVATE/Diary`, `/PRIVATE/Diary/`, and `  PRIVATE/Diary  ` are all
equivalent), and it's always a whole-folder prefix match, never a substring
match — `PRIVATE/Diary` does not accidentally also match a sibling folder
like `PRIVATE/Diaryland`. An empty/whitespace-only value is treated as "no
restriction" (track the whole vault) rather than "match nothing," since
that's the more useful default for an intentionally-cleared field. See
`normalizeScopeFolder`/`inScope` in [`src/core.js`](src/core.js) and their
tests.

### Excluding an automated footer from the count

If a note has an automated footer (e.g. inserted by another plugin or
template), **Footer marker** excludes it: everything from that heading line
onward — the heading itself included — is dropped before word counting.

The value is matched as a whole line, exactly, after trimming leading/
trailing whitespace — not a prefix match. That distinction matters: an empty
`## ` heading used as a footer marker is written as just `##`, and a prefix
match against `##` would also catch every real `## Heading` in the note.
Whole-line matching doesn't. Case-sensitive, matched as a literal string
(never compiled as a regex, so parentheses/brackets/asterisks in the marker
are matched literally). Leave blank to disable. See
[`normalizeFooterMarker`/`stripFooter` in `src/core.js`](src/core.js) and
their tests in [`tests/core.test.js`](tests/core.test.js) for the exact
matching rules.

## Project layout

```
src/core.js     Pure word-counting/scope logic. No obsidian/DOM dependency —
                the whole reason it's unit-testable.
src/main.js     Obsidian plugin class: wires core.js to the real poll timer,
                vault, and editor.
tests/          vitest suite against src/core.js.
manifest.json   Obsidian plugin manifest.
main.js         Built bundle (esbuild output of src/main.js). Committed so
                the repo can be dropped straight into .obsidian/plugins/
                without a build step on the installing machine.
data.json       Runtime settings state — gitignored, not source.
```

## Build

```bash
npm install
npm run build   # bundles src/main.js -> main.js (production, minified)
npm run dev     # same, but watches and rebuilds on save (unminified, sourcemapped)
```

## Test

```bash
npm test
```

`src/core.js` has no `obsidian`/DOM dependency, so it's tested directly —
frontmatter stripping, footer-marker normalization and truncation, word
counting, and scope-folder matching. `src/main.js` (the actual Obsidian
plugin class) isn't unit-tested — it's a thin wrapper around Obsidian's own
APIs (vault, workspace, editor), which aren't available outside a real
Obsidian install. Build it and smoke-test in Obsidian directly instead.

## Install (manual, single-vault use)

This isn't published to the Obsidian community plugin directory. To use it:

1. `npm run build`
2. Copy `manifest.json` and `main.js` into
   `<vault>/.obsidian/plugins/diary-word-count-tracker/`
3. Enable it in Obsidian's Community Plugins settings.

## Known limitations

- **Split-view ambiguity**: `getActiveFile()` doesn't disambiguate which pane
  is "the" active one in a split view.
- **Multi-device last-write-wins**: no merge logic if two devices write
  `words_written` for the same note before syncing.
- **Up to one poll interval of a word-count change can lag behind** if you
  never pause typing long enough to clear the idle threshold before
  switching notes or closing the app.

## License

[MIT](LICENSE)
