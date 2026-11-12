import { describe, it, expect } from "vitest";
import { dispatch } from "../../src/tools/scholaris-router.js";

const PAPER =
  "## Introduction\n\nWe show that method A outperforms method B by 12%.\n\n" +
  "## Method\n\nSee Section 3 for the definition of A.\n\n" +
  "## Results\n\nAs described in the Introduction, A is better.";

describe("router: every action is available with no license or key", () => {
  it("review_paper runs all four profiles", async () => {
    const r = await dispatch({
      action: "review_paper",
      paper_text: PAPER,
      profiles: ["logical", "rhetorical", "structural", "style"],
    });
    expect(r.content[0].text).not.toMatch(/Pro\b|LICENSE/);
  });

  it("check_venue_fit accepts every venue", async () => {
    const r = await dispatch({
      action: "check_venue_fit",
      paper_text: PAPER,
      venues: ["arxiv", "ieee", "acm", "nature", "neurips", "icml"],
    });
    expect(r.content[0].text).not.toMatch(/Pro\b|LICENSE/);
  });

  it("diff_audit runs", async () => {
    const r = await dispatch({
      action: "diff_audit",
      paper_text: PAPER,
      changed_sections: ["Introduction"],
    });
    expect(r.content.length).toBeGreaterThan(0);
  });

  it("generate_rebuttal runs", async () => {
    const r = await dispatch({
      action: "generate_rebuttal",
      reviewer_comments: "Reviewer 1:\n1. The baseline is weak.",
    });
    expect(r.content.length).toBeGreaterThan(0);
  });
});
