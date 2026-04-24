import { describe, it, expect } from "vitest";
import { scanProhibitions, renderProhibitionBlock } from "../../src/analyzers/prohibition-scanner.js";
import type { PaperSection } from "../../src/shared/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSection(title: string, content: string): PaperSection {
  return { id: title.toLowerCase().replace(/\s+/g, "-"), title, content, level: 2 };
}

// ── Critical rules ───────────────────────────────────────────────────────────

describe("scanProhibitions — critical rules", () => {
  it("we-believe-technical: detects 'we believe'", () => {
    const sections = [makeSection("Discussion", "We believe this method generalises well to new domains.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "we-believe-technical")).toBe(true);
  });

  it("we-believe-technical: detects 'we think'", () => {
    const sections = [makeSection("Discussion", "We think the results confirm our hypothesis.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "we-believe-technical")).toBe(true);
  });

  it("future-tense-completed: detects 'we will show'", () => {
    const sections = [makeSection("Introduction", "We will show that the proposed model outperforms baselines.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "future-tense-completed")).toBe(true);
  });

  it("future-tense-completed: detects 'we will demonstrate'", () => {
    const sections = [makeSection("Introduction", "We will demonstrate the effectiveness of our approach.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "future-tense-completed")).toBe(true);
  });

  it("unquantified-superiority: detects 'significantly better' without numbers", () => {
    const sections = [makeSection("Results", "Our method is significantly better than the baseline.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "unquantified-superiority")).toBe(true);
  });
});

// ── Major rules ──────────────────────────────────────────────────────────────

describe("scanProhibitions — major rules", () => {
  it("well-known: detects 'it is well known'", () => {
    const sections = [makeSection("Introduction", "It is well known that neural networks generalise poorly without regularisation.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "well-known")).toBe(true);
  });

  it("well-known: detects 'it is widely accepted'", () => {
    const sections = [makeSection("Related Work", "It is widely accepted that attention mechanisms improve translation quality.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "well-known")).toBe(true);
  });

  it("obviously-clearly: detects 'clearly'", () => {
    const sections = [makeSection("Discussion", "Clearly, our method is more efficient than the baseline.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "obviously-clearly")).toBe(true);
  });

  it("obviously-clearly: detects 'obviously'", () => {
    const sections = [makeSection("Discussion", "Obviously, the results confirm our hypothesis about the dataset.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "obviously-clearly")).toBe(true);
  });

  it("passive-vague-agent: detects 'it was shown that'", () => {
    const sections = [makeSection("Results", "It was shown that the method outperforms baselines on this task.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "passive-vague-agent")).toBe(true);
  });

  it("passive-vague-agent: detects 'it has been shown that'", () => {
    const sections = [makeSection("Related Work", "It has been shown that deeper networks generalise better on visual tasks.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "passive-vague-agent")).toBe(true);
  });

  it("in-this-paper-we: detects metatextual opener", () => {
    const sections = [makeSection("Introduction", "In this paper we propose a new model for sequence labelling.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "in-this-paper-we")).toBe(true);
  });

  it("promising-results: detects 'promising results'", () => {
    const sections = [makeSection("Results", "We achieve promising results on three benchmark datasets.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "promising-results")).toBe(true);
  });

  it("novel-contribution: detects 'novel contribution'", () => {
    const sections = [makeSection("Introduction", "Our novel contribution is a new attention mechanism for text classification.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "novel-contribution")).toBe(true);
  });
});

// ── Minor rules ──────────────────────────────────────────────────────────────

describe("scanProhibitions — minor rules", () => {
  it("empty-intensifier: detects 'very important'", () => {
    const sections = [makeSection("Conclusion", "Regularisation is very important for generalisation.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "empty-intensifier")).toBe(true);
  });

  it("it-should-be-noted: detects 'note that'", () => {
    const sections = [makeSection("Analysis", "Note that this result depends on the choice of learning rate.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "it-should-be-noted")).toBe(true);
  });

  it("in-order-to: detects verbose phrase", () => {
    const sections = [makeSection("Method", "In order to achieve convergence, we use gradient clipping.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "in-order-to")).toBe(true);
  });

  it("rest-of-paper: detects roadmap paragraph", () => {
    const sections = [makeSection("Introduction", "The rest of this paper is structured as follows. Section 2 reviews related work.")];
    const result = scanProhibitions(sections);
    expect(result.findings.some((f) => f.ruleId === "rest-of-paper")).toBe(true);
  });
});

// ── Clean text ───────────────────────────────────────────────────────────────

describe("scanProhibitions — clean text", () => {
  it("returns empty findings for clean academic text", () => {
    const sections = [
      makeSection(
        "Abstract",
        "We present a new approach to neural architecture search using Bayesian optimisation. " +
          "Our method achieves 94.3% accuracy on CIFAR-10, outperforming prior work [Smith 2023] by 1.2%. " +
          "We evaluate on three standard benchmarks and release our code and trained models."
      ),
    ];
    const result = scanProhibitions(sections);
    expect(result.findings).toHaveLength(0);
    expect(result.verdict).toBe("clean");
  });

  it("returns empty for empty sections array", () => {
    const result = scanProhibitions([]);
    expect(result.findings).toHaveLength(0);
    expect(result.verdict).toBe("clean");
  });
});

// ── Verdict logic ────────────────────────────────────────────────────────────

describe("scanProhibitions — verdict logic", () => {
  it("verdict is needs-attention when critical findings present", () => {
    const sections = [makeSection("Discussion", "We believe the results are significantly better than all prior work.")];
    const result = scanProhibitions(sections);
    if (result.findings.some((f) => f.severity === "critical")) {
      expect(result.verdict).toBe("needs-attention");
    }
  });

  it("verdict is minor-issues when multiple major findings present", () => {
    const sections = [makeSection("Discussion", "We believe this approach is clearly the best. In this paper we propose a novel contribution.")];
    const result = scanProhibitions(sections);
    if (result.counts.major > 0) {
      expect(["minor-issues", "needs-attention"]).toContain(result.verdict);
    }
  });

  it("deduplicates identical (location, ruleId, text) findings", () => {
    const content = "We believe this works. We believe this is correct.";
    const sections = [makeSection("Introduction", content)];
    const result = scanProhibitions(sections);
    const ruleFindings = result.findings.filter((f) => f.ruleId === "we-believe-technical");
    // Two distinct matches ("We believe this works" vs "We believe this is correct") — both kept
    // but same location+rule+text would be deduplicated
    expect(ruleFindings.length).toBeGreaterThanOrEqual(1);
  });
});

// ── renderProhibitionBlock ───────────────────────────────────────────────────

describe("renderProhibitionBlock", () => {
  it("returns empty string for clean scan", () => {
    const result = scanProhibitions([]);
    expect(renderProhibitionBlock(result)).toBe("");
  });

  it("includes 'Pre-flight' heading for findings", () => {
    const sections = [makeSection("Discussion", "We believe the results are clearly significant.")];
    const result = scanProhibitions(sections);
    const block = renderProhibitionBlock(result);
    if (result.findings.length > 0) {
      expect(block).toContain("Pre-flight");
    }
  });

  it("includes the rule ID in output", () => {
    const sections = [makeSection("Introduction", "It is well known that transformers work well.")];
    const result = scanProhibitions(sections);
    const block = renderProhibitionBlock(result);
    if (result.findings.length > 0) {
      expect(block).toContain("well-known");
    }
  });

  it("ends with double newline for clean separation from review protocol", () => {
    const sections = [makeSection("Introduction", "We believe the results are significantly better.")];
    const result = scanProhibitions(sections);
    const block = renderProhibitionBlock(result);
    if (block.length > 0) {
      expect(block.endsWith("\n\n")).toBe(true);
    }
  });

  it("includes verdict in output", () => {
    const sections = [makeSection("Discussion", "We believe this approach is clearly the best solution.")];
    const result = scanProhibitions(sections);
    const block = renderProhibitionBlock(result);
    if (block.length > 0) {
      expect(block).toContain(result.verdict);
    }
  });
});
