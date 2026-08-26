import { describe, it, expect } from "vitest";
import {
  stripFrontmatter,
  normalizeFooterMarker,
  stripFooter,
  countWords,
  normalizeScopeFolder,
  inScope,
  DEFAULT_SCOPE_FOLDER,
} from "../src/core.js";

describe("stripFrontmatter", () => {
  it("strips a leading YAML frontmatter block", () => {
    const content = "---\nwords_written: 5\nfoo: bar\n---\nhello world\n";
    expect(stripFrontmatter(content)).toBe("hello world\n");
  });

  it("handles CRLF frontmatter delimiters", () => {
    const content = "---\r\nwords_written: 5\r\n---\r\nhello world\r\n";
    expect(stripFrontmatter(content)).toBe("hello world\r\n");
  });

  it("returns content unchanged when there is no frontmatter block", () => {
    const content = "hello world";
    expect(stripFrontmatter(content)).toBe(content);
  });

  it("does not strip a body that merely contains '---' mid-content", () => {
    // No leading frontmatter block (doesn't start the string) — must not be
    // mistaken for one and have real content stripped.
    const content = "above\n---\nbelow";
    expect(stripFrontmatter(content)).toBe(content);
  });
});

describe("normalizeFooterMarker", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeFooterMarker("  ##  ")).toBe("##");
  });

  it("treats undefined, null, and non-string values as disabled", () => {
    expect(normalizeFooterMarker(undefined)).toBe("");
    expect(normalizeFooterMarker(null)).toBe("");
    expect(normalizeFooterMarker(42)).toBe("");
  });

  it("treats an empty or whitespace-only string as disabled, not as a match-everything marker", () => {
    // The critical footgun: if "" were used as-is in a naive
    // `line.trim() === marker` check, it would equal every blank line, and
    // the first blank line in ANY note would silently truncate it.
    expect(normalizeFooterMarker("")).toBe("");
    expect(normalizeFooterMarker("   ")).toBe("");
    expect(normalizeFooterMarker("\t\n ")).toBe("");
  });

  it("uses only the first line of a pasted multi-line value", () => {
    expect(normalizeFooterMarker("## Footer\nMore pasted text\nEven more")).toBe("## Footer");
  });

  it("does not alter internal characters, including regex metacharacters", () => {
    expect(normalizeFooterMarker("## Footer (auto) [do not edit] *")).toBe(
      "## Footer (auto) [do not edit] *",
    );
  });
});

describe("stripFooter", () => {
  it("returns the body unchanged when the marker is disabled (empty)", () => {
    const body = "para one\n\npara two";
    expect(stripFooter(body, "")).toBe(body);
    expect(stripFooter(body, "   ")).toBe(body);
    expect(stripFooter(body, undefined)).toBe(body);
  });

  it("does not truncate at the first blank line when disabled", () => {
    const body = "before\n\nafter blank line";
    expect(stripFooter(body, "")).toBe(body);
  });

  it("truncates at an exact-match empty H2 marker, dropping the marker line itself", () => {
    const body = "keep this\n##\ndrop this\nand this";
    expect(stripFooter(body, "##")).toBe("keep this");
  });

  it("does not use a prefix/startsWith match — a real heading sharing the marker's prefix survives", () => {
    // The whole reason this can't be startsWith("##"): with an empty-H2
    // marker, prefix matching would also catch "## Reflections" and any
    // other real H2 heading, wrongly discarding real content.
    const body = "## Reflections\nsome real content\n##\nfooter content";
    expect(stripFooter(body, "##")).toBe("## Reflections\nsome real content");
  });

  it("returns the body unchanged when the marker never appears", () => {
    const body = "just some content\nno marker here";
    expect(stripFooter(body, "##")).toBe(body);
  });

  it("cuts at the first occurrence when the marker line appears more than once", () => {
    const body = "keep\n##\nmiddle\n##\nend";
    expect(stripFooter(body, "##")).toBe("keep");
  });

  it("matches case-sensitively", () => {
    const body = "keep this\n## footer\ndrop this";
    expect(stripFooter(body, "## Footer")).toBe(body); // case differs, no match
  });

  it("ignores trailing whitespace on the marker line in the note itself", () => {
    const body = "keep this\n##   \ndrop this";
    expect(stripFooter(body, "##")).toBe("keep this");
  });

  it("matches a heading-with-text marker, not just bare '##'", () => {
    const body = "keep this\n## Automated Footer\ndrop this";
    expect(stripFooter(body, "## Automated Footer")).toBe("keep this");
  });

  it("handles CRLF line endings", () => {
    const body = "keep this\r\n##\r\ndrop this";
    expect(stripFooter(body, "##")).toBe("keep this");
  });

  it("treats a marker containing regex metacharacters as a literal string", () => {
    const body = "keep this\n## Footer (auto) [x] *\ndrop this";
    expect(stripFooter(body, "## Footer (auto) [x] *")).toBe("keep this");
    // A body line that would match if the marker were compiled as a regex
    // must NOT match unless it's identical.
    expect(stripFooter(body, "## Footer .* [x] *")).toBe(body);
  });

  it("only uses the first line of a pasted multi-line marker for matching", () => {
    const body = "keep this\n## Footer\ndrop this";
    expect(stripFooter(body, "## Footer\nsome accidental second line")).toBe("keep this");
  });
});

describe("countWords", () => {
  it("counts words in plain content", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("strips YAML frontmatter before counting", () => {
    const content = "---\nwords_written: 5\nfoo: bar\n---\nhello world\n";
    expect(countWords(content)).toBe(2);
  });

  it("returns 0 for empty or whitespace-only body", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\n  ")).toBe(0);
    expect(countWords("---\nfoo: bar\n---\n   \n")).toBe(0);
  });

  it("collapses multiple whitespace runs between words", () => {
    expect(countWords("one\n\n\tword   two")).toBe(3);
  });

  it("excludes content at and below the footer marker when one is configured", () => {
    const content = "real content here\n##\nauto-generated footer stuff";
    expect(countWords(content, "##")).toBe(3);
  });

  it("counts the full body when no footer marker is configured", () => {
    const content = "real content here\n##\nauto-generated footer stuff";
    expect(countWords(content)).toBe(7); // includes the literal "##" as a word
  });

  it("counts the full body when the configured marker never appears", () => {
    const content = "real content here\nno marker in this note";
    expect(countWords(content, "##")).toBe(8);
  });

  it("applies frontmatter stripping and footer stripping together", () => {
    const content = "---\nwords_written: 1\n---\nkeep these words\n##\ndrop this";
    expect(countWords(content, "##")).toBe(3);
  });
});

describe("normalizeScopeFolder", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeScopeFolder("  PRIVATE/Diary  ")).toBe("PRIVATE/Diary");
  });

  it("strips a leading slash", () => {
    expect(normalizeScopeFolder("/PRIVATE/Diary")).toBe("PRIVATE/Diary");
  });

  it("strips one or more trailing slashes", () => {
    expect(normalizeScopeFolder("PRIVATE/Diary/")).toBe("PRIVATE/Diary");
    expect(normalizeScopeFolder("PRIVATE/Diary//")).toBe("PRIVATE/Diary");
  });

  it("strips leading and trailing slashes together, in any combination", () => {
    expect(normalizeScopeFolder("/PRIVATE/Diary/")).toBe("PRIVATE/Diary");
  });

  it("treats undefined, null, and non-string values as no restriction", () => {
    expect(normalizeScopeFolder(undefined)).toBe("");
    expect(normalizeScopeFolder(null)).toBe("");
    expect(normalizeScopeFolder(42)).toBe("");
  });

  it("treats an empty or whitespace-only string as no restriction", () => {
    expect(normalizeScopeFolder("")).toBe("");
    expect(normalizeScopeFolder("   ")).toBe("");
  });
});

describe("inScope", () => {
  it("accepts paths under DEFAULT_SCOPE_FOLDER when no scope folder is passed", () => {
    expect(inScope(`${DEFAULT_SCOPE_FOLDER}/2026-08-22.md`)).toBe(true);
    expect(inScope(`${DEFAULT_SCOPE_FOLDER}/sub/nested.md`)).toBe(true);
  });

  it("rejects paths outside the default scope folder, including near-miss prefixes", () => {
    expect(inScope("PRIVATE/Diaryland/note.md")).toBe(false); // prefix collision, not a real subpath
    expect(inScope("2-WIKI/note.md")).toBe(false);
  });

  it("rejects non-string path input regardless of scope folder", () => {
    expect(inScope(null)).toBe(false);
    expect(inScope(undefined)).toBe(false);
  });

  it("respects a custom scope folder", () => {
    expect(inScope("Journal/2026-08-22.md", "Journal")).toBe(true);
    expect(inScope("PRIVATE/Diary/2026-08-22.md", "Journal")).toBe(false);
  });

  it("normalizes the scope folder before comparing, including near-miss prefix rejection", () => {
    expect(inScope("Journal/note.md", "/Journal/")).toBe(true);
    expect(inScope("Journal/note.md", "  Journal  ")).toBe(true);
    expect(inScope("Journalism/note.md", "Journal")).toBe(false); // still not a prefix match
  });

  it("treats an empty/whitespace-only scope folder string as no restriction (vault-wide)", () => {
    expect(inScope("anywhere/at/all.md", "")).toBe(true);
    expect(inScope("anywhere/at/all.md", "   ")).toBe(true);
  });

  it("falls back to the default scope folder when the argument is omitted entirely (not vault-wide)", () => {
    // JS default parameters also apply to an explicit `undefined`, distinct
    // from an actual empty string, which is how "no restriction" gets
    // triggered in practice (a cleared settings field).
    expect(inScope("anywhere/at/all.md", undefined)).toBe(false);
    expect(inScope(`${DEFAULT_SCOPE_FOLDER}/note.md`, undefined)).toBe(true);
  });
});
