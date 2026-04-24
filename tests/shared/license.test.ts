import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPro, requirePro, freeVenues, freeProfiles } from "../../src/shared/license/index.js";
import { ProFeatureError } from "../../src/shared/errors/index.js";
import { dispatch } from "../../src/tools/scholaris-router.js";
import { clearCaches } from "../../src/registry/loader.js";

beforeEach(() => {
  delete process.env["SCHOLARIS_LICENSE_KEY"];
  clearCaches();
});

afterEach(() => {
  delete process.env["SCHOLARIS_LICENSE_KEY"];
});

// ── isPro ────────────────────────────────────────────────────────────────────

describe("isPro", () => {
  it("returns false when env var is unset", () => {
    expect(isPro()).toBe(false);
  });

  it("returns true when env var is set to a non-empty string", () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "test-key-abc123";
    expect(isPro()).toBe(true);
  });

  it("returns false when env var is an empty string", () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "";
    expect(isPro()).toBe(false);
  });

  it("returns false when env var is whitespace only", () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "   ";
    expect(isPro()).toBe(false);
  });
});

// ── requirePro ───────────────────────────────────────────────────────────────

describe("requirePro", () => {
  it("throws ProFeatureError when not pro", () => {
    expect(() => requirePro("diff_audit")).toThrow(ProFeatureError);
  });

  it("includes the feature name in the error message", () => {
    expect(() => requirePro("diff_audit")).toThrow('"diff_audit"');
  });

  it("includes the upgrade URL in the error message", () => {
    expect(() => requirePro("diff_audit")).toThrow("https://forgeworkshop.dev/scholaris");
  });

  it("does not throw when pro", () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "test-key-abc123";
    expect(() => requirePro("diff_audit")).not.toThrow();
  });
});

// ── freeVenues / freeProfiles ────────────────────────────────────────────────

describe("freeVenues", () => {
  it("returns arxiv, acm, and ieee", () => {
    expect(freeVenues()).toEqual(expect.arrayContaining(["arxiv", "acm", "ieee"]));
    expect(freeVenues()).toHaveLength(3);
  });
});

describe("freeProfiles", () => {
  it("returns structural and style", () => {
    expect(freeProfiles()).toEqual(expect.arrayContaining(["structural", "style"]));
    expect(freeProfiles()).toHaveLength(2);
  });
});

// ── Router: pro-only actions are gated ───────────────────────────────────────

const MINIMAL_PAPER = `
# Abstract
This paper presents a new method that achieves 15% improvement over baselines.
Results are detailed in Section 4.

## Introduction
We study efficient transformers. See Section 4 for details.
Prior work is summarized in Section 3.

## Related Work
Several approaches have been proposed. BERT and RoBERTa are the primary baselines.

## Method
Our approach uses sparse attention. We define sparsity ratio as k/n.

## Experiments
We evaluate on three benchmarks. Table 1 shows results.

## Conclusion
We presented a novel method achieving state-of-the-art results.
`.trim();

describe("router: diff_audit is gated behind Pro", () => {
  it("throws ProFeatureError when SCHOLARIS_LICENSE_KEY is unset", async () => {
    await expect(
      dispatch({
        action: "diff_audit",
        paper_text: MINIMAL_PAPER,
        changed_sections: ["Introduction"],
      })
    ).rejects.toThrow(ProFeatureError);
  });

  it("error message includes the upgrade URL", async () => {
    await expect(
      dispatch({
        action: "diff_audit",
        paper_text: MINIMAL_PAPER,
        changed_sections: ["Introduction"],
      })
    ).rejects.toThrow("https://forgeworkshop.dev/scholaris");
  });

  it("succeeds when SCHOLARIS_LICENSE_KEY is set", async () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "test-key-abc123";
    const result = await dispatch({
      action: "diff_audit",
      paper_text: MINIMAL_PAPER,
      changed_sections: ["Introduction"],
    });
    expect(result.content[0].text).toBeTruthy();
  });
});

describe("router: generate_rebuttal is gated behind Pro", () => {
  it("throws ProFeatureError when SCHOLARIS_LICENSE_KEY is unset", async () => {
    await expect(
      dispatch({
        action: "generate_rebuttal",
        reviewer_comments: "Reviewer 1:\n1. The paper needs more experiments.\n2. The writing is unclear.",
      })
    ).rejects.toThrow(ProFeatureError);
  });

  it("error message includes the upgrade URL", async () => {
    await expect(
      dispatch({
        action: "generate_rebuttal",
        reviewer_comments: "Reviewer 1:\n1. The paper needs more experiments.",
      })
    ).rejects.toThrow("https://forgeworkshop.dev/scholaris");
  });

  it("succeeds when SCHOLARIS_LICENSE_KEY is set", async () => {
    process.env["SCHOLARIS_LICENSE_KEY"] = "test-key-abc123";
    const result = await dispatch({
      action: "generate_rebuttal",
      reviewer_comments: "Reviewer 1:\n1. The paper needs more experiments.",
    });
    expect(result.content[0].text).toBeTruthy();
  });
});

// ── Router: free-tier graceful degradation ───────────────────────────────────

describe("router: review_paper graceful degradation on free tier", () => {
  it("runs with only free profiles when a pro profile is requested", async () => {
    const result = await dispatch({
      action: "review_paper",
      paper_text: MINIMAL_PAPER,
      profiles: ["logical", "structural"],
    });
    expect(result.content[0].text).not.toContain("isError");
  });

  it("appends a Pro upgrade note when pro profiles were requested", async () => {
    const result = await dispatch({
      action: "review_paper",
      paper_text: MINIMAL_PAPER,
      profiles: ["logical", "structural"],
    });
    expect(result.content[0].text).toContain("Scholaris Pro");
    expect(result.content[0].text).toContain("https://forgeworkshop.dev/scholaris");
  });

  it("does not append a note when only free profiles are requested", async () => {
    const result = await dispatch({
      action: "review_paper",
      paper_text: MINIMAL_PAPER,
      profiles: ["structural", "style"],
    });
    expect(result.content[0].text).not.toContain("https://forgeworkshop.dev/scholaris");
  });
});

describe("router: check_venue_fit graceful degradation on free tier", () => {
  it("appends a Pro upgrade note when pro venues were requested", async () => {
    const result = await dispatch({
      action: "check_venue_fit",
      paper_text: MINIMAL_PAPER,
      venues: ["arxiv", "neurips"],
    });
    expect(result.content[0].text).toContain("Scholaris Pro");
    expect(result.content[0].text).toContain("https://forgeworkshop.dev/scholaris");
  });

  it("does not append a note when only free venues are requested", async () => {
    const result = await dispatch({
      action: "check_venue_fit",
      paper_text: MINIMAL_PAPER,
      venues: ["arxiv", "acm"],
    });
    expect(result.content[0].text).not.toContain("https://forgeworkshop.dev/scholaris");
  });

  it("silently limits to free venues when no venues are specified", async () => {
    const result = await dispatch({
      action: "check_venue_fit",
      paper_text: MINIMAL_PAPER,
    });
    expect(result.content[0].text).not.toContain("https://forgeworkshop.dev/scholaris");
    // Should only show the 3 free venues
    expect(result.content[0].text).not.toContain("NeurIPS");
    expect(result.content[0].text).not.toContain("ICML");
    expect(result.content[0].text).not.toContain("Nature");
  });
});
