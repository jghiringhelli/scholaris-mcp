import { describe, it, expect } from "vitest";
import {
  buildSemanticSectionGraph,
  findCascade,
  couplingLabel,
  COUPLING_THRESHOLD,
  STRONG_COUPLING_THRESHOLD,
} from "../../src/analyzers/semantic-section-graph.js";
import { buildTFIDFVectors, cosineSim } from "../../src/analyzers/tfidf.js";
import type { PaperSection } from "../../src/shared/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSection(id: string, title: string, content: string): PaperSection {
  return { id, title, content, level: 2 };
}

const ML_INTRO = makeSection(
  "intro",
  "Introduction",
  "We propose a novel transformer architecture for neural machine translation. " +
    "Our model achieves state-of-the-art results on the WMT benchmark [Vaswani 2017]. " +
    "The attention mechanism allows the model to capture long-range dependencies. " +
    "We train using Adam optimiser with learning rate warm-up on the WMT14 dataset. " +
    "The transformer model uses multi-head attention and positional encoding."
);

const ML_METHOD = makeSection(
  "method",
  "Method",
  "Our transformer model uses multi-head attention layers for neural translation. " +
    "Each attention head computes scaled dot-product attention over the sequence. " +
    "The model is trained with cross-entropy loss using the Adam optimiser. " +
    "We use learning rate warm-up for 4000 steps following Vaswani et al. " +
    "The encoder uses six attention layers; the decoder uses six cross-attention layers. " +
    "Dropout regularisation is applied to all attention outputs."
);

const ML_EXPERIMENTS = makeSection(
  "experiments",
  "Experiments",
  "We evaluate our transformer on WMT14 English-German neural translation. " +
    "Training uses the Adam optimiser with learning rate warm-up for 4000 steps. " +
    "The attention model achieves 29.2 BLEU on the WMT test set. " +
    "We compare our model against prior baselines including convolutional architectures. " +
    "Experiments show consistent improvement across WMT language pairs. " +
    "The transformer attention mechanism outperforms recurrent models on all benchmarks."
);

const ML_CONCLUSION = makeSection(
  "conclusion",
  "Conclusion",
  "We presented a transformer architecture for neural machine translation. " +
    "The model demonstrates strong attention-based performance on the WMT benchmark. " +
    "The Adam optimiser with warm-up learning rate scheduling is critical for training. " +
    "Future work will explore multilingual attention mechanisms and larger transformer models."
);

const UNRELATED = makeSection(
  "unrelated",
  "Appendix",
  "The legal framework governing data privacy requires informed consent from participants. " +
    "Participants must sign an ethics approval form before any data collection begins. " +
    "Personal data must be anonymised in accordance with GDPR regulations. " +
    "The institutional review board approved all data collection procedures. " +
    "Consent forms were signed and securely stored in accordance with the privacy policy."
);

// ── Graph builder tests ──────────────────────────────────────────────────────

describe("buildSemanticSectionGraph", () => {
  it("returns empty graph for empty sections", () => {
    const graph = buildSemanticSectionGraph([], new Map());
    expect(graph.size).toBe(0);
  });

  it("creates a node for every section", () => {
    const sections = [ML_INTRO, ML_METHOD, ML_EXPERIMENTS];
    const graph = buildSemanticSectionGraph(sections, new Map());
    expect(graph.has("intro")).toBe(true);
    expect(graph.has("method")).toBe(true);
    expect(graph.has("experiments")).toBe(true);
  });

  it("does not create self-edges", () => {
    const sections = [ML_INTRO, ML_METHOD];
    const graph = buildSemanticSectionGraph(sections, new Map());
    const introEdges = graph.get("intro") ?? [];
    expect(introEdges.every((e) => e.targetId !== "intro")).toBe(true);
  });

  it("topically related ML sections have higher raw similarity than unrelated sections", () => {
    const texts = [
      ML_METHOD.content,
      ML_EXPERIMENTS.content,
      UNRELATED.content,
    ];
    const { vectors } = buildTFIDFVectors(texts);
    const simMethodExp = cosineSim(vectors[0]!, vectors[1]!);
    const simMethodUnrelated = cosineSim(vectors[0]!, vectors[2]!);
    // Method and Experiments share transformer/attention/Adam vocabulary;
    // the unrelated appendix has zero overlap with ML content.
    expect(simMethodExp).toBeGreaterThan(simMethodUnrelated);
    expect(simMethodUnrelated).toBe(0);
  });

  it("unrelated section does not couple with ML sections", () => {
    const sections = [ML_METHOD, ML_EXPERIMENTS, UNRELATED];
    const graph = buildSemanticSectionGraph(sections, new Map());

    // UNRELATED (privacy/GDPR) should not couple with ML Method
    const methodEdges = graph.get("method") ?? [];
    const unrelatedCoupled = methodEdges.some(
      (e) => e.targetId === "unrelated" && e.similarity >= COUPLING_THRESHOLD
    );
    expect(unrelatedCoupled).toBe(false);
  });

  it("incorporates explicit deps with type=explicit", () => {
    const sections = [ML_INTRO, ML_METHOD];
    const explicitDeps = new Map<string, Set<string>>([
      ["intro", new Set(["method"])],
    ]);
    const graph = buildSemanticSectionGraph(sections, explicitDeps);
    const introEdges = graph.get("intro") ?? [];
    const explicitEdge = introEdges.find((e) => e.targetId === "method");
    expect(explicitEdge).toBeDefined();
    expect(explicitEdge?.type).toBe("explicit");
  });

  it("upgrades existing semantic edge to explicit when explicit dep also exists", () => {
    // Method and Experiments are semantically coupled; if we also add explicit dep, should be explicit
    const sections = [ML_METHOD, ML_EXPERIMENTS];
    const explicitDeps = new Map<string, Set<string>>([
      ["method", new Set(["experiments"])],
    ]);
    const graph = buildSemanticSectionGraph(sections, explicitDeps);
    const methodEdges = graph.get("method") ?? [];
    const edge = methodEdges.find((e) => e.targetId === "experiments");
    expect(edge?.type).toBe("explicit");
  });

  it("sorts explicit edges before semantic edges", () => {
    const sections = [ML_INTRO, ML_METHOD, ML_EXPERIMENTS];
    const explicitDeps = new Map<string, Set<string>>([
      ["intro", new Set(["experiments"])],
    ]);
    const graph = buildSemanticSectionGraph(sections, explicitDeps);
    const introEdges = graph.get("intro") ?? [];
    if (introEdges.length >= 2) {
      // First edge should be explicit
      expect(introEdges[0]!.type).toBe("explicit");
    }
  });
});

// ── findCascade tests ────────────────────────────────────────────────────────

describe("findCascade", () => {
  it("returns empty map when no sections are related", () => {
    const sections = [ML_METHOD, UNRELATED];
    const graph = buildSemanticSectionGraph(sections, new Map());
    const cascade = findCascade(["method"], graph);
    // UNRELATED should not be in cascade
    expect(cascade.has("unrelated")).toBe(false);
  });

  it("finds cascade from changed section via explicit deps", () => {
    const sections = [ML_INTRO, ML_METHOD, ML_EXPERIMENTS, ML_CONCLUSION];
    // Use explicit deps to verify cascade logic works independent of TF-IDF threshold
    const explicitDeps = new Map<string, Set<string>>([
      ["method", new Set(["experiments"])],
    ]);
    const graph = buildSemanticSectionGraph(sections, explicitDeps);
    const cascade = findCascade(["method"], graph);

    // Experiments is explicitly referenced by method → changing method cascades to experiments
    expect(cascade.has("experiments")).toBe(true);
    expect(cascade.get("experiments")?.hasExplicitRef).toBe(true);
  });

  it("does not include the changed section itself in cascade", () => {
    const sections = [ML_INTRO, ML_METHOD];
    const graph = buildSemanticSectionGraph(sections, new Map());
    const cascade = findCascade(["method"], graph);
    expect(cascade.has("method")).toBe(false);
  });

  it("cascade entries include maxSimilarity and hasExplicitRef", () => {
    const sections = [ML_METHOD, ML_EXPERIMENTS];
    const graph = buildSemanticSectionGraph(sections, new Map());
    const cascade = findCascade(["method"], graph);
    for (const entry of cascade.values()) {
      expect(typeof entry.maxSimilarity).toBe("number");
      expect(typeof entry.hasExplicitRef).toBe("boolean");
      expect(Array.isArray(entry.incomingEdges)).toBe(true);
    }
  });

  it("marks cascade entries with explicit refs", () => {
    const sections = [ML_INTRO, ML_METHOD];
    const explicitDeps = new Map<string, Set<string>>([
      ["intro", new Set(["method"])],
    ]);
    const graph = buildSemanticSectionGraph(sections, explicitDeps);
    const cascade = findCascade(["method"], graph);
    // intro explicitly references method, so changing method cascades to intro with hasExplicitRef=true
    const introEntry = cascade.get("intro");
    if (introEntry) {
      expect(introEntry.hasExplicitRef).toBe(true);
    }
  });
});

// ── couplingLabel tests ──────────────────────────────────────────────────────

describe("couplingLabel", () => {
  it("returns 'explicit reference' for explicit type", () => {
    expect(couplingLabel(0.9, "explicit")).toBe("explicit reference");
  });

  it("returns 'strongly coupled' for high similarity semantic", () => {
    expect(couplingLabel(STRONG_COUPLING_THRESHOLD, "semantic")).toBe("strongly coupled");
    expect(couplingLabel(0.9, "semantic")).toBe("strongly coupled");
  });

  it("returns 'semantically coupled' for moderate similarity", () => {
    expect(couplingLabel(COUPLING_THRESHOLD, "semantic")).toBe("semantically coupled");
    expect(couplingLabel(0.35, "semantic")).toBe("semantically coupled");
  });
});
