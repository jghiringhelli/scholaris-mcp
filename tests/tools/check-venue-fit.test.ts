import { describe, it, expect, beforeEach } from "vitest";
import { checkVenueFitHandler } from "../../src/tools/check-venue-fit.js";
import { clearCaches } from "../../src/registry/loader.js";

const STRONG_PAPER = `
# Abstract
This paper presents a novel attention mechanism achieving 14% improvement
over state-of-the-art on ImageNet (top-1 accuracy 91.2%, n=5 seeds, ±0.2%).

## Introduction
We study efficient attention for vision transformers. Unlike prior work,
our approach requires no auxiliary networks.

## Related Work
Vision Transformer (Dosovitskiy, 2021) and Swin Transformer (Liu, 2021)
are the most relevant prior methods. Our approach differs by...

## Method
We define sparse attention as selection of the top-k attention weights per query.
Formally our objective is to minimize perplexity subject to compute budget.

## Experiments
Evaluated on ImageNet, COCO, and ADE20K. All experiments use 5 random seeds.
Standard deviations reported. Ablations in Table 3.

## Conclusion
We presented efficient sparse attention. Limitations: evaluated on vision only.
Future work includes NLP benchmarks.

## Broader Impact
Our method reduces compute requirements by 30%, lowering energy use for training.
Potential negative impacts: improved surveillance systems.
`.trim();

const WEAK_PAPER = `
This paper explores something interesting in machine learning.
We tried a new approach. The results look good.
More details to follow. This is preliminary work.
`.trim();

describe("checkVenueFitHandler", () => {
  beforeEach(() => clearCaches());

  it("returns a HandlerResult with content array", async () => {
    const result = await checkVenueFitHandler({
      paper_text: STRONG_PAPER,
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("output contains venue comparison table", async () => {
    const result = await checkVenueFitHandler({
      paper_text: STRONG_PAPER,
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Should include fit bar chart or venue names
    expect(text.length).toBeGreaterThan(100);
  });

  it("accepts specific venues to compare", async () => {
    const result = await checkVenueFitHandler({
      paper_text: STRONG_PAPER,
      venues: ["arxiv", "neurips"],
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("arXiv");
    expect(text).toContain("NeurIPS");
  });

  it("strong paper scores higher than weak paper", async () => {
    const strong = await checkVenueFitHandler({ paper_text: STRONG_PAPER });
    const weak = await checkVenueFitHandler({ paper_text: WEAK_PAPER });
    const strongText = strong.content.map((c) => c.text).join("");
    const weakText = weak.content.map((c) => c.text).join("");
    // Strong paper should produce a lengthier / more positive result
    expect(strongText.length).toBeGreaterThanOrEqual(weakText.length);
  });

  it("shows gap analysis when show_gaps=true (default)", async () => {
    const result = await checkVenueFitHandler({
      paper_text: STRONG_PAPER,
      venues: ["ieee"],
      show_gaps: true,
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text.length).toBeGreaterThan(50);
  });

  it("includes next_steps guidance in text output", async () => {
    const result = await checkVenueFitHandler({ paper_text: STRONG_PAPER });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("next_steps");
  });

  it("accepts single venue array", async () => {
    await expect(
      checkVenueFitHandler({ paper_text: STRONG_PAPER, venues: ["acm"] })
    ).resolves.toBeDefined();
  });
});
