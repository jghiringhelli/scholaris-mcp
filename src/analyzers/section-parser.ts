/**
 * Paper section parser.
 * Splits paper text into structured sections, detecting markdown headings,
 * LaTeX section commands, and plain-text numbered headers.
 */

import type { PaperSection } from "../shared/types.js";
import { PaperParseError } from "../shared/errors/index.js";

// ── Detection patterns ─────────────────────────────────────────────────────

/** Markdown heading: # Introduction, ## Related Work, etc. */
const MARKDOWN_HEADING = /^(#{1,4})\s+(.+)$/m;

/** LaTeX section: \section{Introduction}, \subsection{...}, etc. */
const LATEX_SECTION = /^\\(sub){0,2}section\*?\{([^}]+)\}/m;

/** Numbered plain-text heading: "1. Introduction", "2.1 Related Work" */
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)\s{1,4}([A-Z][^\n]{2,60})$/m;

type SectionFormat = "markdown" | "latex" | "numbered" | "unknown";

interface RawHeading {
  readonly title: string;
  readonly level: number;
  readonly offset: number;
}

/**
 * Detects the predominant section format used in the paper text.
 *
 * @param text - Full paper text.
 * @returns Detected format.
 */
export function detectSectionFormat(text: string): SectionFormat {
  const mdCount = (text.match(/^#{1,4}\s+/gm) ?? []).length;
  const latexCount = (text.match(/^\\(sub){0,2}section/gm) ?? []).length;
  const numberedCount = (text.match(/^\d+\.\s+[A-Z]/gm) ?? []).length;

  if (latexCount >= 2) return "latex";
  if (mdCount >= 2) return "markdown";
  if (numberedCount >= 2) return "numbered";
  return "unknown";
}

/**
 * Extracts raw headings and their positions from paper text.
 *
 * @param text - Full paper text.
 * @param format - Section format to use for parsing.
 * @returns Array of raw headings with offset positions.
 */
function extractHeadings(text: string, format: SectionFormat): ReadonlyArray<RawHeading> {
  const headings: RawHeading[] = [];
  const lines = text.split("\n");
  let offset = 0;

  for (const line of lines) {
    const heading = parseHeadingFromLine(line, format, offset);
    if (heading) headings.push(heading);
    offset += line.length + 1; // +1 for the newline
  }

  return headings;
}

/**
 * Parses a single line into a RawHeading if it matches the format.
 */
function parseHeadingFromLine(
  line: string,
  format: SectionFormat,
  lineOffset: number
): RawHeading | null {
  if (format === "markdown" || format === "unknown") {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) return { title: m[2]!.trim(), level: m[1]!.length, offset: lineOffset };
  }
  if (format === "latex") {
    const m = line.match(/^\\(sub){0,2}section\*?\{([^}]+)\}/);
    if (m) {
      const level = (m[0]!.match(/sub/g) ?? []).length + 1;
      return { title: m[2]!.trim(), level, offset: lineOffset };
    }
  }
  if (format === "numbered") {
    const m = line.match(/^(\d+(?:\.\d+)*)[\.\s]\s*([A-Z][^\n]{2,60})$/);
    if (m) {
      const level = m[1]!.split(".").length;
      return { title: m[2]!.trim(), level, offset: lineOffset };
    }
  }
  return null;
}

/**
 * Generates a URL-safe slug from a section title.
 *
 * @param title - Section title text.
 * @param index - Fallback index for deduplication.
 * @returns Slug string.
 */
export function titleToSlug(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return slug || `section-${index}`;
}

/**
 * Splits paper text into structured PaperSection objects.
 *
 * @param text - Full paper text.
 * @returns Array of parsed sections.
 * @throws {PaperParseError} If the text is too short to parse meaningfully.
 */
export function parseSections(text: string): ReadonlyArray<PaperSection> {
  if (text.trim().length < 50) {
    throw new PaperParseError("Text too short to parse", text.slice(0, 100));
  }

  const format = detectSectionFormat(text);
  const headings = extractHeadings(text, format);

  if (headings.length === 0) {
    // Return whole text as single unnamed section
    return [
      {
        id: "section-0",
        title: "Document",
        level: 1,
        index: 0,
        content: text,
        charStart: 0,
        charEnd: text.length,
      },
    ];
  }

  const sections: PaperSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    const nextHeading = headings[i + 1];
    const startOffset = heading.offset;
    const endOffset = nextHeading ? nextHeading.offset : text.length;
    const content = text.slice(startOffset, endOffset).trim();

    sections.push({
      id: titleToSlug(heading.title, i),
      title: heading.title,
      level: heading.level,
      index: i,
      content,
      charStart: startOffset,
      charEnd: endOffset,
    });
  }

  // If there is text before the first heading, add a preamble section
  if (headings[0] && headings[0].offset > 0) {
    const preamble = text.slice(0, headings[0].offset).trim();
    if (preamble.length > 10) {
      sections.unshift({
        id: "preamble",
        title: "Preamble",
        level: 0,
        index: -1,
        content: preamble,
        charStart: 0,
        charEnd: headings[0].offset,
      });
    }
  }

  return sections;
}
