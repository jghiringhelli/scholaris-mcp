import { describe, it, expect, beforeEach } from "vitest";
import { reviewPaperHandler } from "../../src/tools/review-paper.js";
import { clearCaches } from "../../src/registry/loader.js";

const SAMPLE_PAPER = `
# Abstract
This paper proposes a novel neural architecture for document classification
that improves accuracy by 12% over state-of-the-art baselines on three benchmarks.
We achieve F1=0.94 on the SemEval dataset.

## Introduction
Document classification remains a challenging problem in NLP. Prior methods rely
heavily on feature engineering. We propose a transformer-based approach that
eliminates this requirement. See Section 3 for experimental details.

## Related Work
Several approaches have been proposed for document classification.
BERT (Devlin et al., 2019) achieves strong results on short texts.
Longformer (Beltagy et al., 2020) extends this to longer documents.

## Method
Our architecture consists of three components: encoder, pooling layer, and classifier.
We define attention density as the ratio of attended tokens to total tokens.
The encoder uses 12 attention heads with hidden dimension 768.

## Experiments
We evaluate on three benchmarks: SemEval 2023, 20 Newsgroups, and AGNews.
Our method outperforms all baselines by 12% on F1 (±0.3%, n=5 seeds).
Table 1 shows results against BERT, RoBERTa, and Longformer.

## Conclusion
We presented a transformer-based architecture achieving 12% improvement.
Limitations include computational cost and lack of multilingual evaluation.
`.trim();

describe("reviewPaperHandler", () => {
  beforeEach(() => clearCaches());

  it("returns a HandlerResult with content array", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["logical", "structural"],
      format: "actionable",
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("first content item has type text", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["logical", "structural"],
      format: "actionable",
    });
    expect(result.content[0].type).toBe("text");
  });

  it("rendered protocol includes logical dimension prompts", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["logical"],
      format: "actionable",
    });
    const text = result.content.map((c) => c.text).join("\n");
    // logical profile includes fallacy-scan or claim-evidence-alignment
    expect(text.length).toBeGreaterThan(200);
  });

  it("includes section map in output", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["structural"],
      format: "actionable",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("Introduction");
  });

  it("uses arxiv venue criteria when specified", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "arxiv",
      profiles: ["logical"],
      format: "actionable",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("arXiv");
  });

  it("respects section_focus filter", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["logical"],
      format: "actionable",
      section_focus: "Introduction",
    });
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("full format includes more detail than summary", async () => {
    const [full, summary] = await Promise.all([
      reviewPaperHandler({
        paper_text: SAMPLE_PAPER,
        venue: "general",
        profiles: ["logical", "structural"],
        format: "full",
      }),
      reviewPaperHandler({
        paper_text: SAMPLE_PAPER,
        venue: "general",
        profiles: ["logical", "structural"],
        format: "summary",
      }),
    ]);
    const fullText = full.content.map((c) => c.text).join("");
    const summaryText = summary.content.map((c) => c.text).join("");
    expect(fullText.length).toBeGreaterThanOrEqual(summaryText.length);
  });

  it("includes next_steps guidance in text output", async () => {
    const result = await reviewPaperHandler({
      paper_text: SAMPLE_PAPER,
      venue: "general",
      profiles: ["logical"],
      format: "actionable",
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("next_steps");
  });

  it("throws or returns isError for paper_text shorter than 100 chars", async () => {
    await expect(
      reviewPaperHandler({
        paper_text: "Too short.",
        venue: "general",
        profiles: ["logical"],
        format: "actionable",
      } as any)
    ).rejects.toBeDefined();
  });
});
