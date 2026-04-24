import { describe, it, expect } from "vitest";
import {
  buildWordNgrams,
  jaccardSimilarity,
  documentNgramSimilarity,
  findSuspiciousPassages,
} from "../../src/analyzers/ngram.js";

describe("buildWordNgrams", () => {
  it("generates correct 5-grams from a sentence", () => {
    const ngrams = buildWordNgrams("the quick brown fox jumps over lazy dog", 5);
    expect(ngrams.has("the quick brown fox jumps")).toBe(true);
    expect(ngrams.has("quick brown fox jumps over")).toBe(true);
  });

  it("returns empty set when text is too short for n", () => {
    expect(buildWordNgrams("only three words", 5).size).toBe(0);
  });

  it("lowercases and strips punctuation before windowing", () => {
    const ngrams = buildWordNgrams("Hello, World! This is great.", 3);
    expect(ngrams.has("hello world this")).toBe(true);
  });

  it("returns a single n-gram when text has exactly n words", () => {
    const ngrams = buildWordNgrams("alpha beta gamma delta epsilon", 5);
    expect(ngrams.size).toBe(1);
    expect(ngrams.has("alpha beta gamma delta epsilon")).toBe(true);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const s = new Set(["a b c d e", "b c d e f"]);
    expect(jaccardSimilarity(s, s)).toBeCloseTo(1.0);
  });

  it("returns 0 for completely disjoint sets", () => {
    const a = new Set(["foo bar baz qux quux"]);
    const b = new Set(["one two three four five"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns 0 when both sets are empty", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
  });

  it("is symmetric", () => {
    const a = new Set(["a b c", "b c d", "c d e"]);
    const b = new Set(["b c d", "d e f", "e f g"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(jaccardSimilarity(b, a));
  });

  it("partial overlap produces score in (0, 1)", () => {
    const a = new Set(["shared ngram here now", "unique to first set"]);
    const b = new Set(["shared ngram here now", "unique to second set"]);
    const score = jaccardSimilarity(a, b);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("documentNgramSimilarity", () => {
  it("returns high similarity for near-identical texts", () => {
    const base = "We propose a novel method for sequence modeling using attention mechanisms.";
    const copy = "We propose a novel method for sequence modeling using attention mechanisms.";
    expect(documentNgramSimilarity(base, copy)).toBeCloseTo(1.0);
  });

  it("returns low similarity for unrelated texts", () => {
    const a = "Deep learning transformers for natural language processing tasks.";
    const b = "Microbial community analysis in soil samples using metagenomic sequencing.";
    expect(documentNgramSimilarity(a, b)).toBeLessThan(0.1);
  });

  it("returns higher similarity for a partial copy than unrelated text", () => {
    // 5-gram Jaccard detects shared word sequences, not semantic similarity.
    // A partial verbatim copy shares n-grams; an unrelated text shares none.
    const original = "We develop a contrastive learning framework without negative samples for self-supervised vision.";
    const partialCopy = "We develop a contrastive learning framework without negative samples and apply it to medical imaging.";
    const unrelated = "The stock market declined following unexpected inflation data released by the government.";
    expect(documentNgramSimilarity(original, partialCopy)).toBeGreaterThan(
      documentNgramSimilarity(original, unrelated)
    );
  });
});

describe("findSuspiciousPassages", () => {
  it("returns empty array when one text is empty", () => {
    const passages = findSuspiciousPassages("Some source text here.", "", 0.1);
    expect(passages).toHaveLength(0);
  });

  it("detects verbatim copied sentence", () => {
    const verbatim = "We propose a novel deep learning model for protein structure prediction using graph neural networks.";
    const source = `Introduction follows here. ${verbatim} This is original content.`;
    const reference = `Abstract. ${verbatim} Other original content in the reference paper.`;

    const passages = findSuspiciousPassages(source, reference, 0.15, 5, 5);
    expect(passages.length).toBeGreaterThan(0);
    expect(passages[0]!.score).toBeGreaterThan(0.5);
  });

  it("results are sorted by score descending", () => {
    const copyA = "We propose a novel deep learning model for protein structure prediction using graph neural networks that outperforms existing approaches.";
    const copyB = "Our results demonstrate significant improvement over baseline methods on standard benchmarks.";
    const source = `${copyA} Some unique text here. ${copyB}`;
    const reference = `${copyA} Reference unique content. ${copyB}`;

    const passages = findSuspiciousPassages(source, reference, 0.1, 10, 5);
    for (let i = 1; i < passages.length; i++) {
      expect(passages[i - 1]!.score).toBeGreaterThanOrEqual(passages[i]!.score);
    }
  });

  it("respects topN limit", () => {
    const base = "This is a sentence that will be copied verbatim for testing plagiarism detection purposes.";
    const sentences = Array.from({ length: 20 }, (_, i) => `${base} Variation ${i}.`);
    const source = sentences.join(" ");
    const reference = sentences.join(" ");

    const passages = findSuspiciousPassages(source, reference, 0.1, 3, 5);
    expect(passages.length).toBeLessThanOrEqual(3);
  });

  it("threshold filters low-similarity pairs", () => {
    const source = "Our model achieves state of the art results.";
    const reference = "The baseline method gets decent performance scores.";
    const highThreshold = findSuspiciousPassages(source, reference, 0.9);
    expect(highThreshold).toHaveLength(0);
  });
});
