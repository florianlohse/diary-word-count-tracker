// Pure logic for Diary Word Count Tracker: no `obsidian` or DOM dependency
// anywhere in this file, so it can be unit-tested directly rather than only
// through a real Obsidian install. src/main.js wires this up to real vault
// events, timers, and the editor.

// The vault-specific default for this installation — pre-filled into the
// "Target folder" setting, not a hardcoded restriction. See
// normalizeScopeFolder()/inScope() below for how the live setting is used.
const DEFAULT_SCOPE_FOLDER = "PRIVATE/Diary";
const FRONTMATTER_FIELD = "words_written";

const DEFAULT_SETTINGS = {
  scopeFolder: DEFAULT_SCOPE_FOLDER,
  pollIntervalSec: 30,
  idleThresholdSec: 4,
  // This vault's real footer marker, so it works out of the box — unlike a
  // generically-distributed plugin, there's no risk here of surprising a
  // vault that happens to contain an unrelated blank "##" heading.
  footerMarker: "##",
};

function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

/**
 * Reduces a raw footer-marker setting value down to the single line it's
 * meant to represent, so the comparison in stripFooter() is well-defined no
 * matter what gets typed or pasted into the settings field:
 *
 * - undefined/null/non-string (unset) -> "" (disabled)
 * - "" or whitespace-only -> "" (disabled) — critical: an *empty* string
 *   must never be treated as "match every line", or the first blank line in
 *   any note would truncate the whole body.
 * - a pasted multi-line value -> only its first line is used, so a stray
 *   paste can't silently make the match condition unreachable.
 * - leading/trailing whitespace on that line is trimmed.
 */
function normalizeFooterMarker(footerMarker) {
  if (typeof footerMarker !== "string") return "";
  const firstLine = footerMarker.split(/\r\n|\r|\n/)[0];
  return firstLine.trim();
}

/**
 * Truncates body content at the footer marker line, if present — the
 * marker line itself and everything after it is dropped. Matches the whole
 * line, exactly, after trimming both sides — deliberately NOT a prefix/
 * startsWith match: with a marker of "##" (an empty H2), a startsWith match
 * would also match "## Reflections" or any other real H2 heading and wrongly
 * discard real content. Case-sensitive, and matched as a literal string
 * (never compiled as a regex).
 *
 * If the marker doesn't appear anywhere in the body, or is disabled
 * (normalizes to ""), the body is returned unchanged. If it appears more
 * than once, only the first occurrence starts the cut.
 */
function stripFooter(body, footerMarker) {
  const marker = normalizeFooterMarker(footerMarker);
  if (!marker) return body;

  const lines = body.split(/\r\n|\r|\n/);
  const cutIndex = lines.findIndex((line) => line.trim() === marker);
  if (cutIndex === -1) return body;

  return lines.slice(0, cutIndex).join("\n");
}

function countWords(content, footerMarker) {
  const body = stripFooter(stripFrontmatter(content), footerMarker);
  const trimmed = body.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Reduces a raw "Target folder" setting value down to a clean vault-relative
 * folder path for comparison — the same defensive spirit as
 * normalizeFooterMarker() above, applied to a different kind of awkward
 * input:
 *
 * - undefined/null/non-string -> "" (no restriction — see inScope())
 * - leading/trailing whitespace -> trimmed
 * - a leading "/" (vault paths never start with one; a user might still
 *   type it out of habit) -> stripped, so matching isn't silently broken
 * - one or more trailing "/" (e.g. pasted as "PRIVATE/Diary/") -> stripped,
 *   so the "+ '/'" suffix inScope() adds isn't doubled
 */
function normalizeScopeFolder(scopeFolder) {
  if (typeof scopeFolder !== "string") return "";
  return scopeFolder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * scopeFolder defaults to DEFAULT_SCOPE_FOLDER so existing call sites that
 * don't pass one keep working unchanged. An empty/whitespace-only
 * scopeFolder — after normalization — is treated as "no restriction
 * configured": every path is in scope. That's deliberate: an empty target
 * folder plausibly means "track the whole vault," and silently tracking
 * nothing with no visible explanation would be a worse default. Always a
 * whole-folder prefix match, never a substring match, so a sibling folder
 * like PRIVATE/Diaryland is rejected.
 */
function inScope(path, scopeFolder = DEFAULT_SCOPE_FOLDER) {
  if (typeof path !== "string") return false;
  const folder = normalizeScopeFolder(scopeFolder);
  if (!folder) return true;
  return path.startsWith(folder + "/");
}

module.exports = {
  DEFAULT_SCOPE_FOLDER,
  FRONTMATTER_FIELD,
  DEFAULT_SETTINGS,
  stripFrontmatter,
  normalizeFooterMarker,
  stripFooter,
  countWords,
  normalizeScopeFolder,
  inScope,
};
