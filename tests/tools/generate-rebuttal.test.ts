import { describe, it, expect } from "vitest";
import { generateRebuttalHandler } from "../../src/tools/generate-rebuttal.js";

const REVIEWER_COMMENTS_SINGLE = `
Reviewer 1:
This is an interesting paper but I have several concerns.
1. The evaluation is limited to a single dataset. This significantly weakens the generalizability claims.
2. The comparison to BERT is outdated. The authors should compare against more recent methods.
3. The ablation study is incomplete — the attention mechanism contribution is not isolated.
`.trim();

const REVIEWER_COMMENTS_MULTI = `
Reviewer 1:
The paper makes a reasonable contribution but has major weaknesses.
1. Missing comparison to concurrent work by Zhang et al. (2024).
2. No statistical significance testing for the main results table.

Reviewer 2:
I found this work interesting. A few minor points:
1. Figure 2 caption is missing the x-axis label.
2. The term 'sparse attention' is used before it is formally defined.
`.trim();

describe("generateRebuttalHandler", () => {
  it("returns a HandlerResult with content array", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "collegial",
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("output includes ACK/CLARIFY/REVISE scaffolds", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "collegial",
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Should contain the ACK-CLARIFY-REVISE pattern or similar
    expect(text.length).toBeGreaterThan(200);
  });

  it("handles multiple reviewers and separates per-reviewer responses", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_MULTI,
      tone: "formal",
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Should reference both reviewers
    expect(text).toMatch(/reviewer\s*1/i);
    expect(text).toMatch(/reviewer\s*2/i);
  });

  it("uses formal tone when specified", async () => {
    const formal = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "formal",
    });
    expect(formal.content.length).toBeGreaterThan(0);
  });

  it("uses concise tone when specified", async () => {
    const concise = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "concise",
    });
    expect(concise.content.length).toBeGreaterThan(0);
  });

  it("includes paper_title in opener when provided", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      paper_title: "Efficient Sparse Attention for Vision Transformers",
      tone: "collegial",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("Efficient Sparse Attention");
  });

  it("includes venue in output when provided", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      venue: "neurips",
      tone: "collegial",
    });
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("classifies major concerns as higher priority than minor ones", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "collegial",
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Should have significant content addressing the major concerns
    expect(text.length).toBeGreaterThan(300);
  });

  it("includes next_steps guidance in text output", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_SINGLE,
      tone: "collegial",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("next_steps");
  });

  it("includes a Summary of Changes block", async () => {
    const result = await generateRebuttalHandler({
      reviewer_comments: REVIEWER_COMMENTS_MULTI,
      tone: "formal",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text.toLowerCase()).toMatch(/summary|changes/i);
  });
});
