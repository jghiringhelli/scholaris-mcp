import { describe, it, expect } from "vitest";
import { compressDraftHandler } from "../../src/tools/compress-draft.js";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ABSTRACT_SECTION = `
## Abstract

This paper proposes a novel framework for distributed consensus in heterogeneous networks.
We demonstrate that by combining Paxos-derived leader election with Byzantine fault tolerance,
latency can be reduced by 40% under adversarial conditions. The system is evaluated on a
150-node testbed and validated against three production failure scenarios.
`.trim();

const INTRO_SECTION = `
## Introduction

This paper proposes a novel framework for distributed consensus in heterogeneous networks.
We demonstrate that by combining Paxos-derived leader election with Byzantine fault tolerance,
latency can be reduced substantially under adversarial conditions. Our system is evaluated
on a 150-node testbed. The rest of the paper is organized as follows.
`.trim();

const METHODS_SECTION = `
## Methodology

We designed a two-phase commit protocol with adaptive timeout logic. The leader election
module runs every 500ms and promotes the lowest-latency peer. Fault injection is performed
using Chaos Monkey. All experiments use Prometheus for metrics collection and Grafana for
visualization. We ran 1,000 fault injection trials per scenario across three independent
cluster configurations.
`.trim();

const RESULTS_SECTION = `
## Results

The 150-node testbed showed 40% latency reduction under adversarial Byzantine conditions.
Throughput improved by 22% over baseline Paxos. Fault recovery time dropped from 2.3s
to 0.8s median. The adaptive timeout mechanism was the primary contributor to latency
improvement in 87% of measured scenarios.
`.trim();

const CONCLUSION_SECTION = `
## Conclusion

We presented a novel distributed consensus framework. Latency reduction of 40% was
demonstrated. Byzantine fault tolerance was confirmed at scale. Future work will explore
multi-datacenter deployments and formal verification of the election protocol.
`.trim();

/** A document where abstract and intro are near-duplicates. */
const REPETITIVE_PAPER = [
  ABSTRACT_SECTION,
  INTRO_SECTION,
  METHODS_SECTION,
  RESULTS_SECTION,
  CONCLUSION_SECTION,
].join("\n\n");

/** A document with clean, distinct sections. */
const CLEAN_PAPER = [
  ABSTRACT_SECTION,
  METHODS_SECTION,
  RESULTS_SECTION,
  CONCLUSION_SECTION,
].join("\n\n");

/** A document with an oversized abstract (>30% of total). */
function buildBloatedAbstractPaper(): string {
  const bloatedAbstract = `## Abstract\n\n${"This paper presents a comprehensive analysis of distributed systems. ".repeat(80)}`;
  return [bloatedAbstract, METHODS_SECTION, RESULTS_SECTION].join("\n\n");
}

// ── Handler contract ──────────────────────────────────────────────────────────

describe("compressDraftHandler", () => {
  it("returns a text content item", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text.length).toBeGreaterThan(100);
  });

  it("report includes the Saint-Exupéry epigraph", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    expect(result.content[0]!.text).toContain("Saint-Exupéry");
  });

  it("report includes section verdict table", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    const text = result.content[0]!.text;
    expect(text).toContain("Verdict");
    expect(text).toContain("load-bearing");
  });

  it("flags a near-duplicate section for removal on repetitive input", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    const text = result.content[0]!.text;
    // Introduction is a near-duplicate of Abstract — should be flagged
    expect(text).toMatch(/remove|compress/i);
  });

  it("flags fewer sections on a clean paper than on a repetitive one", async () => {
    const [repetitiveResult, cleanResult] = await Promise.all([
      compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" }),
      compressDraftHandler({ paper_text: CLEAN_PAPER, mode: "moderate" }),
    ]);

    const countFlags = (text: string) =>
      (text.match(/🗑️ remove|✂️ compress/g) ?? []).length;

    const repetitiveFlags = countFlags(repetitiveResult.content[0]!.text);
    const cleanFlags = countFlags(cleanResult.content[0]!.text);
    expect(repetitiveFlags).toBeGreaterThanOrEqual(cleanFlags);
  });

  it("aggressive mode flags more than light mode on the same input", async () => {
    const [aggressive, light] = await Promise.all([
      compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "aggressive" }),
      compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "light" }),
    ]);

    const countFlags = (text: string) =>
      (text.match(/🗑️ remove|✂️ compress/g) ?? []).length;

    expect(countFlags(aggressive.content[0]!.text)).toBeGreaterThanOrEqual(
      countFlags(light.content[0]!.text)
    );
  });

  it("emits a structural alert for a bloated abstract", async () => {
    const result = await compressDraftHandler({
      paper_text: buildBloatedAbstractPaper(),
      mode: "moderate",
    });
    const text = result.content[0]!.text;
    expect(text.toLowerCase()).toMatch(/abstract.*%|structural alert/i);
  });

  it("surfaces a repeated-passage pair when near-verbatim content appears in two sections", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    const text = result.content[0]!.text;
    // Repeated Passages section should appear since abstract and intro share long runs of text
    expect(text).toMatch(/Repeated Passages|Jaccard/i);
  });

  it("summary includes word count estimate", async () => {
    const result = await compressDraftHandler({ paper_text: REPETITIVE_PAPER, mode: "moderate" });
    const text = result.content[0]!.text;
    // Should mention words recoverable
    expect(text).toMatch(/\d+.*word|word.*\d+/i);
  });

  it("identifies load-bearing sections in a clean paper", async () => {
    const result = await compressDraftHandler({ paper_text: CLEAN_PAPER, mode: "moderate" });
    expect(result.content[0]!.text).toContain("load-bearing");
  });

  it("handles minimal two-section input without throwing", async () => {
    const minimal = `## Section One\n\nCompletely original content about quantum mechanics.\n\n## Section Two\n\nEntirely different content about medieval history and social structures.`;
    const result = await compressDraftHandler({ paper_text: minimal, mode: "moderate" });
    expect(result.content[0]!.type).toBe("text");
  });
});
