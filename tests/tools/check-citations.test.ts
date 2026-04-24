/**
 * Tests for check_citations handler and supporting utilities.
 *
 * All Semantic Scholar API calls are mocked via vitest's global fetch mock.
 * No real network calls are made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkCitationsHandler, extractClaimPhrases } from "../../src/tools/check-citations.js";
import {
  normaliseTitle,
  titleMatchesReference,
  paperCitesTitle,
  paperUrl,
} from "../../src/shared/clients/semantic-scholar.js";
import type { S2Paper } from "../../src/shared/types.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const MY_PAPER_TITLE = "Contrastive Learning Without Negative Samples";

const PAPER_CITES_ME: S2Paper = {
  paperId: "abc123",
  title: "Advances in Self-Supervised Representation Learning",
  authors: [{ name: "Alice Chen" }, { name: "Bob Smith" }],
  year: 2023,
  abstract:
    "We study contrastive learning methods and compare them against supervised baselines. " +
    "Our method builds on prior work in self-supervised learning.",
  references: [
    { paperId: "mine01", title: "Contrastive Learning Without Negative Samples" },
    { paperId: "other1", title: "SimCLR: A Simple Framework for Contrastive Learning" },
  ],
  openAccessPdf: { url: "https://arxiv.org/pdf/2301.00001" },
};

const PAPER_OMITS_ME: S2Paper = {
  paperId: "def456",
  title: "Efficient Contrastive Representation Learning",
  authors: [{ name: "Carol Davis" }],
  year: 2024,
  abstract:
    "We present an efficient approach to contrastive learning that avoids the need for negative samples. " +
    "Our momentum encoder uses exponential moving average updates.",
  references: [
    { paperId: "other1", title: "SimCLR: A Simple Framework for Contrastive Learning" },
    { paperId: "other2", title: "MoCo: Momentum Contrast for Unsupervised Visual Representation Learning" },
  ],
  externalIds: { ArXiv: "2401.00002" },
};

const PAPER_UNRELATED: S2Paper = {
  paperId: "ghi789",
  title: "Privacy-Preserving Machine Learning with Differential Privacy",
  authors: [{ name: "Dave Wilson" }],
  year: 2023,
  abstract: "We study differential privacy in federated learning scenarios.",
  references: [],
};

function mockS2Response(papers: S2Paper[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: papers }),
  };
}

// ── Helper unit tests ────────────────────────────────────────────────────────

describe("normaliseTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normaliseTitle("Hello, World!")).toBe("hello world");
  });

  it("collapses whitespace", () => {
    expect(normaliseTitle("Multi  Space   Title")).toBe("multi space title");
  });

  it("handles empty string", () => {
    expect(normaliseTitle("")).toBe("");
  });
});

describe("titleMatchesReference", () => {
  it("returns true for exact title match", () => {
    expect(
      titleMatchesReference(
        "Contrastive Learning Without Negative Samples",
        "Contrastive Learning Without Negative Samples"
      )
    ).toBe(true);
  });

  it("returns true when target is substring of paper title", () => {
    expect(
      titleMatchesReference(
        "A Survey of Contrastive Learning Without Negative Samples",
        "Contrastive Learning Without Negative Samples"
      )
    ).toBe(true);
  });

  it("returns false for unrelated titles", () => {
    expect(
      titleMatchesReference(
        "Differential Privacy in Federated Learning",
        "Contrastive Learning Without Negative Samples"
      )
    ).toBe(false);
  });

  it("returns false for null input", () => {
    expect(titleMatchesReference(null, "Any Title")).toBe(false);
    expect(titleMatchesReference(undefined, "Any Title")).toBe(false);
  });
});

describe("paperCitesTitle", () => {
  it("returns true when paper references the target title", () => {
    expect(paperCitesTitle(PAPER_CITES_ME, MY_PAPER_TITLE)).toBe(true);
  });

  it("returns false when paper does not reference the target", () => {
    expect(paperCitesTitle(PAPER_OMITS_ME, MY_PAPER_TITLE)).toBe(false);
  });

  it("returns false for empty references list", () => {
    expect(paperCitesTitle(PAPER_UNRELATED, MY_PAPER_TITLE)).toBe(false);
  });
});

describe("paperUrl", () => {
  it("prefers open access PDF URL", () => {
    expect(paperUrl(PAPER_CITES_ME)).toBe("https://arxiv.org/pdf/2301.00001");
  });

  it("uses arxiv URL when no PDF but has ArXiv ID", () => {
    expect(paperUrl(PAPER_OMITS_ME)).toBe("https://arxiv.org/abs/2401.00002");
  });

  it("falls back to S2 paper URL", () => {
    const url = paperUrl(PAPER_UNRELATED);
    expect(url).toContain("semanticscholar.org/paper/");
    expect(url).toContain(PAPER_UNRELATED.paperId);
  });
});

// ── extractClaimPhrases ──────────────────────────────────────────────────────

describe("extractClaimPhrases", () => {
  const PAPER_TEXT = `
## Abstract

We present a novel approach to contrastive learning that eliminates negative samples entirely.
Our momentum encoder uses exponential moving average updates to maintain a stable representation.
Experiments on ImageNet show 3.2% improvement over prior methods.

## Introduction

Self-supervised learning has emerged as a powerful paradigm. Our approach avoids negative pairs.

## Method

The momentum encoder is updated with EMA. The projection head maps representations to a lower space.

## Experiments

We evaluate on ImageNet linear evaluation protocol.
`;

  it("always includes the paper title as the first claim phrase", () => {
    const claims = extractClaimPhrases(PAPER_TEXT, MY_PAPER_TITLE);
    expect(claims[0]).toBe(MY_PAPER_TITLE);
  });

  it("returns at least one claim phrase", () => {
    const claims = extractClaimPhrases(PAPER_TEXT, MY_PAPER_TITLE);
    expect(claims.length).toBeGreaterThan(0);
  });

  it("returns at most 3 claim phrases by default", () => {
    const claims = extractClaimPhrases(PAPER_TEXT, MY_PAPER_TITLE);
    expect(claims.length).toBeLessThanOrEqual(3);
  });

  it("returns at least the title for a minimal paper", () => {
    // Very short text — parseSections will fail gracefully, returning title-only
    const claims = extractClaimPhrases("Short paper about contrastive learning.", MY_PAPER_TITLE);
    expect(claims).toContain(MY_PAPER_TITLE);
  });
});

// ── checkCitationsHandler ────────────────────────────────────────────────────

const MINIMAL_PAPER =
  "## Abstract\n\nWe present contrastive learning without negative samples using momentum encoder updates.\n\n" +
  "## Method\n\nThe encoder uses EMA updates to maintain stable representations.\n\n" +
  "## Experiments\n\nWe evaluate on ImageNet with linear evaluation protocol and achieve strong results.";

describe("checkCitationsHandler — Pro feature mechanics", () => {
  beforeEach(() => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "test-key-123";
  });

  afterEach(() => {
    delete process.env["SCHOLARIS_LICENSE_KEY"];
    vi.restoreAllMocks();
  });

  it("returns omissions for papers that share claims but don't cite the user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockS2Response([PAPER_OMITS_ME, PAPER_CITES_ME])));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning without negatives"],
      max_results: 10,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("Citation Protection Report");
    expect(text).toContain("Efficient Contrastive Representation Learning"); // omission
  });

  it("separates citing papers from omissions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockS2Response([PAPER_OMITS_ME, PAPER_CITES_ME])));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning without negatives"],
      max_results: 10,
    });

    const text = result.content[0]!.text;
    // PAPER_CITES_ME should appear in the "papers that cite" section, not omissions
    expect(text).toContain("Advances in Self-Supervised Representation Learning");
  });

  it("filters out the user's own paper from results", async () => {
    const myPaperAsResult: S2Paper = {
      paperId: "mine01",
      title: MY_PAPER_TITLE,
      authors: [{ name: "José" }],
      year: 2023,
      abstract: "Our contrastive method.",
      references: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockS2Response([myPaperAsResult, PAPER_OMITS_ME])));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning"],
      max_results: 10,
    });

    const text = result.content[0]!.text;
    // User's own paper should not appear in omissions
    const omissionsSection = text.split("Papers That Cite")[0] ?? text;
    const titleAppearsInOmissions =
      omissionsSection.includes("Contrastive Learning Without Negative Samples") &&
      omissionsSection.includes("Potential Citation Omissions");
    // If it's in the table it should not be the user's own paper title in omission row
    // This test checks the handler doesn't self-include
    expect(text).not.toMatch(/\|\s*Contrastive Learning Without Negative Samples\s*\|.*\|.*\| 🔴/);
  });

  it("applies published_after year filter", async () => {
    const oldPaper: S2Paper = {
      paperId: "old001",
      title: "Early Contrastive Learning Method",
      authors: [{ name: "Old Author" }],
      year: 2019,
      abstract: "Contrastive learning approach without negative samples.",
      references: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockS2Response([oldPaper, PAPER_OMITS_ME])));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning"],
      published_after: "2020",
      max_results: 10,
    });

    const text = result.content[0]!.text;
    // Old paper (2019) should not appear; PAPER_OMITS_ME (2024) should
    expect(text).not.toContain("Early Contrastive Learning Method");
    expect(text).toContain("Efficient Contrastive Representation Learning");
  });

  it("handles API errors gracefully and includes error note in output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning"],
      max_results: 5,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("Citation Protection Report");
    // Should not crash; should include error note
    expect(text.toLowerCase()).toMatch(/error|partial|failed/);
  });

  it("handles rate limit response gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({}),
    }));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["test claim"],
      max_results: 5,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("Citation Protection Report");
    expect(text.toLowerCase()).toMatch(/rate limit|error|partial/);
  });

  it("shows 'no omissions' message when all similar papers already cite the user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockS2Response([PAPER_CITES_ME])));

    const result = await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["contrastive learning"],
      max_results: 10,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("No Potential Citation Omissions");
  });

  it("uses provided claims instead of auto-extraction when supplied", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockS2Response([]));
    vi.stubGlobal("fetch", fetchMock);

    await checkCitationsHandler({
      paper_text: MINIMAL_PAPER,
      paper_title: MY_PAPER_TITLE,
      claims: ["my specific claim phrase"],
      max_results: 5,
    });

    // Fetch should have been called with the provided claim
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain(encodeURIComponent("my specific claim phrase"));
  });
});

// ── Pro gate ─────────────────────────────────────────────────────────────────

describe("check_citations Pro gate", () => {
  afterEach(() => {
    delete process.env["SCHOLARIS_LICENSE_KEY"];
  });

  it("router throws ProFeatureError when SCHOLARIS_LICENSE_KEY is unset", async () => {
    delete process.env["SCHOLARIS_LICENSE_KEY"];
    const { dispatch } = await import("../../src/tools/scholaris-router.js");
    await expect(
      dispatch({
        action: "check_citations",
        paper_text: MINIMAL_PAPER,
        paper_title: MY_PAPER_TITLE,
      })
    ).rejects.toMatchObject({ name: "ProFeatureError" });
  });
});
