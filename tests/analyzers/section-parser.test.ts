import { describe, it, expect } from "vitest";
import {
  detectSectionFormat,
  parseSections,
  titleToSlug,
} from "../../src/analyzers/section-parser.js";

const MARKDOWN_PAPER = `
# Abstract
This paper presents a novel approach.

## Introduction
We study the problem of X. Prior work has shown Y.

## Related Work
Several approaches exist.

## Method
Our approach uses Z.

## Experiments
We evaluate on three benchmarks.

## Conclusion
We presented a method for X.
`.trim();

const LATEX_PAPER = `
\\section{Introduction}
We study the problem.

\\subsection{Background}
Prior work established Z.

\\section{Method}
Our method proceeds as follows.
`;

const NUMBERED_PAPER = `
1. Introduction
We study the problem of X.

2. Related Work
Prior methods have addressed Y.

3. Method
We propose Z.
`;

describe("detectSectionFormat", () => {
  it("detects markdown format from # headings", () => {
    expect(detectSectionFormat(MARKDOWN_PAPER)).toBe("markdown");
  });

  it("detects latex format from \\\\section commands", () => {
    expect(detectSectionFormat(LATEX_PAPER)).toBe("latex");
  });

  it("detects numbered format from numeric headings", () => {
    expect(detectSectionFormat(NUMBERED_PAPER)).toBe("numbered");
  });

  it("returns unknown for plain prose", () => {
    const plainText =
      "This is a paper without any section headings. It just has prose.";
    expect(detectSectionFormat(plainText)).toBe("unknown");
  });
});

describe("titleToSlug", () => {
  it("converts title to lowercase hyphenated slug", () => {
    expect(titleToSlug("Related Work", 1)).toBe("related-work");
  });

  it("removes special characters", () => {
    expect(titleToSlug("Method & Analysis!", 2)).toBe("method-analysis");
  });

  it("uses index as fallback for empty titles", () => {
    expect(titleToSlug("", 3)).toBe("section-3");
  });

  it("collapses multiple spaces", () => {
    expect(titleToSlug("Experimental   Setup", 0)).toBe("experimental-setup");
  });

  it("strips leading and trailing hyphens", () => {
    expect(titleToSlug("  Abstract  ", 0)).toBe("abstract");
  });
});

describe("parseSections", () => {
  it("parses markdown sections by # headings", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    expect(sections.length).toBeGreaterThan(3);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Abstract");
    expect(titles).toContain("Introduction");
    expect(titles).toContain("Method");
  });

  it("assigns unique ids to each section", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    const ids = sections.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("assigns sequential index values", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    sections.forEach((s, i) => expect(s.index).toBe(i));
  });

  it("captures section content (non-empty)", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    const intro = sections.find((s) => s.title === "Introduction");
    expect(intro).toBeDefined();
    expect(intro!.content.length).toBeGreaterThan(0);
  });

  it("parses latex sections", () => {
    const sections = parseSections(LATEX_PAPER);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Introduction");
    expect(titles).toContain("Method");
  });

  it("parses numbered sections", () => {
    const sections = parseSections(NUMBERED_PAPER);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Introduction");
    expect(titles).toContain("Related Work");
  });

  it("returns a single section for plain prose with no headings", () => {
    const plain =
      "This paper presents something. It has no headings whatsoever.";
    const sections = parseSections(plain);
    expect(sections.length).toBe(1);
    expect(sections[0].id).toBe("section-0");
  });

  it("sets charStart and charEnd correctly", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    sections.forEach((s) => {
      expect(s.charStart).toBeGreaterThanOrEqual(0);
      expect(s.charEnd).toBeGreaterThan(s.charStart);
    });
  });

  it("section charEnd of one section equals charStart of next (approximately)", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    for (let i = 0; i < sections.length - 1; i++) {
      expect(sections[i].charEnd).toBeLessThanOrEqual(sections[i + 1].charStart + 5);
    }
  });

  it("level reflects heading depth for markdown", () => {
    const sections = parseSections(MARKDOWN_PAPER);
    const intro = sections.find((s) => s.title === "Introduction");
    // ## = level 2
    expect(intro!.level).toBe(2);
  });
});
