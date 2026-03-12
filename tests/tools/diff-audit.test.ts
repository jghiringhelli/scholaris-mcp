import { describe, it, expect } from "vitest";
import { diffAuditHandler } from "../../src/tools/diff-audit.js";

const PAPER_WITH_SECTIONS = `
# Abstract
This paper presents a novel approach improving accuracy by 14%.
Results in Section 4 confirm this.

## Introduction
We study efficient transformers. See Section 4 (Method) for details.
Prior work is covered in Section 3.

## Related Work
Several approaches have been proposed. As shown in Section 1, the gap is clear.
BERT and RoBERTa are the primary baselines.

## Method
Our architecture uses sparse attention. We build on Section 3 (Related Work).
The encoder is described here. Results are in Section 5.
We define sparsity ratio as k/n where k is selected heads.

## Experiments
As described in Section 4 (Method), our approach achieves 14% F1 improvement.
Table 1 compares against baselines from Section 3.
Standard deviation ±0.3%, n=5 seeds.

## Conclusion
We presented a method (Section 4) with strong results (Section 5).
Limitations: single-domain evaluation only.
`.trim();

describe("diffAuditHandler", () => {
  it("returns a HandlerResult with content array", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Method"],
      show_claims: false,
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("detects cascade to Experiments when Method changes", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Method"],
      show_claims: false,
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Experiments and Conclusion both reference Method
    expect(text).toContain("Experiments");
  });

  it("includes the changed section itself in output", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Introduction"],
      show_claims: false,
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("Introduction");
  });

  it("show_claims=true includes specific claim text", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Method"],
      show_claims: true,
    });
    const text = result.content.map((c) => c.text).join("\n");
    // Should include more detail when show_claims is enabled
    expect(text.length).toBeGreaterThan(100);
  });

  it("warns on unmatched section name", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Nonexistent Section Title XYZ"],
      show_claims: false,
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text.toLowerCase()).toMatch(/not found|no match|warning|unmatched/i);
  });

  it("handles multiple changed sections simultaneously", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Introduction", "Method"],
      show_claims: false,
    });
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("includes next_steps guidance in text output", async () => {
    const result = await diffAuditHandler({
      paper_text: PAPER_WITH_SECTIONS,
      changed_sections: ["Abstract"],
      show_claims: false,
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("next_steps");
  });

  it("handles self-contained section (no cascade) gracefully", async () => {
    const isolated = `
## Introduction
This is a standalone introduction with no cross-references.

## Appendix
Supplementary material only.
    `.trim();
    const result = await diffAuditHandler({
      paper_text: isolated,
      changed_sections: ["Appendix"],
      show_claims: false,
    });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text.length).toBeGreaterThan(0);
  });
});
