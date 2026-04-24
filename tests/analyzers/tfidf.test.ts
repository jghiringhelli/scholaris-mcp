import { describe, it, expect } from "vitest";
import { tokenize, buildTFIDFVectors, cosineSim, vocabularyOverlap } from "../../src/analyzers/tfidf.js";

describe("tokenize", () => {
  it("lowercases and removes punctuation", () => {
    const tokens = tokenize("Hello, World!");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("removes stop words", () => {
    const tokens = tokenize("the cat is on the mat");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("on");
    expect(tokens).toContain("cat");
    expect(tokens).toContain("mat");
  });

  it("preserves technical hyphenated terms by splitting them", () => {
    const tokens = tokenize("state-of-the-art bi-directional attention");
    expect(tokens).toContain("state");
    expect(tokens).toContain("art");
    expect(tokens).toContain("bi");
    expect(tokens).toContain("directional");
    expect(tokens).toContain("attention");
  });

  it("removes pure numbers", () => {
    const tokens = tokenize("We use 42 samples");
    expect(tokens).not.toContain("42");
    expect(tokens).toContain("samples");
  });

  it("returns empty for blank text", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("preserves domain terms that look like stop words in other contexts", () => {
    // "model", "layer", "loss" — common in ML papers, must not be stopped
    const tokens = tokenize("The model learns a hidden layer loss function");
    expect(tokens).toContain("model");
    expect(tokens).toContain("layer");
    expect(tokens).toContain("loss");
  });
});

describe("buildTFIDFVectors", () => {
  it("returns empty result for empty input", () => {
    const { vocabulary, vectors } = buildTFIDFVectors([]);
    expect(vocabulary).toEqual([]);
    expect(vectors).toEqual([]);
  });

  it("builds vectors with shared vocabulary length", () => {
    const { vocabulary, vectors } = buildTFIDFVectors([
      "neural network training loss",
      "gradient descent optimization loss",
    ]);
    expect(vocabulary.length).toBeGreaterThan(0);
    expect(vectors).toHaveLength(2);
    for (const vec of vectors) {
      expect(vec).toHaveLength(vocabulary.length);
    }
  });

  it("gives higher TF-IDF weight to discriminating terms", () => {
    const { vocabulary, vectors } = buildTFIDFVectors([
      "attention mechanism transformer model",
      "random forest decision tree model",
    ]);
    const attentionIdx = vocabulary.indexOf("attention");
    const modelIdx = vocabulary.indexOf("model");

    // "attention" only in doc 0 → higher IDF → higher weight in doc 0
    if (attentionIdx >= 0 && modelIdx >= 0) {
      expect(vectors[0]![attentionIdx]).toBeGreaterThan(vectors[0]![modelIdx]!);
    }
  });
});

describe("cosineSim", () => {
  it("returns 1.0 for identical non-zero vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSim(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSim([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSim([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("is symmetric", () => {
    const a = [0.5, 0.2, 0.8];
    const b = [0.1, 0.9, 0.3];
    expect(cosineSim(a, b)).toBeCloseTo(cosineSim(b, a));
  });

  it("returns value in [0, 1]", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const sim = cosineSim(a, b);
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it("similar TF-IDF vectors produce high cosine similarity", () => {
    const { vectors } = buildTFIDFVectors([
      "neural network deep learning gradient",
      "deep neural network learning gradient descent",
      "random forest decision tree ensemble",
    ]);
    const sim01 = cosineSim(vectors[0]!, vectors[1]!);
    const sim02 = cosineSim(vectors[0]!, vectors[2]!);
    expect(sim01).toBeGreaterThan(sim02);
  });
});

describe("vocabularyOverlap", () => {
  it("returns 1.0 when all query terms are in target", () => {
    const score = vocabularyOverlap("neural network", "deep neural network architecture");
    expect(score).toBeCloseTo(1.0);
  });

  it("returns 0 when no query terms are in target", () => {
    const score = vocabularyOverlap("quantum mechanics", "neural network gradient descent");
    expect(score).toBe(0);
  });

  it("returns 0 for empty query", () => {
    expect(vocabularyOverlap("", "anything here")).toBe(0);
  });

  it("is case-insensitive", () => {
    const score = vocabularyOverlap("NEURAL NETWORK", "deep neural network");
    expect(score).toBeCloseTo(1.0);
  });

  it("partial match returns fractional score", () => {
    const score = vocabularyOverlap("neural network attention transformer", "neural network only");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
