/**
 * TF-IDF vectorizer and cosine similarity for section-level semantic analysis.
 *
 * Used by the semantic section graph to detect topical coupling between
 * paper sections without any external model or API call.
 *
 * Academic stop-word list is tuned to preserve technical vocabulary:
 * "attention", "model", "layer", "loss" are NOT stopped because they
 * carry domain meaning in CS/ML papers.
 */

// ── Stop words ─────────────────────────────────────────────────────────────
// Standard English function words only — intentionally minimal so that
// domain terms are preserved for technical paper analysis.

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "it", "its", "this", "that", "these",
  "those", "i", "you", "he", "she", "we", "they", "me", "him", "her",
  "us", "them", "my", "your", "his", "our", "their", "what", "which",
  "who", "from", "into", "through", "during", "before", "after", "above",
  "below", "between", "each", "both", "more", "than", "then", "so", "if",
  "as", "not", "no", "up", "out", "also", "such", "when", "where", "how",
  "all", "any", "can", "two", "one", "three", "four", "five",
]);

// ── Tokenizer ──────────────────────────────────────────────────────────────

/**
 * Tokenizes text for TF-IDF / BM25 analysis.
 * Preserves technical tokens (hyphenated terms, abbreviations ≥2 chars).
 *
 * @param text - Input text.
 * @returns Array of lowercase tokens with stop words removed.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^\w\s-]/g, " ")        // keep hyphens for "state-of-the-art", "bi-directional"
    .split(/\s+/)
    .flatMap((t) => t.split("-"))     // split hyphenated terms into parts
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

// ── TF-IDF ─────────────────────────────────────────────────────────────────

/**
 * Term frequency within a single document (normalized by doc length).
 */
function buildTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const total = Math.max(tokens.length, 1);
  for (const [t, c] of freq) freq.set(t, c / total);
  return freq;
}

/**
 * Inverse document frequency over a corpus of token arrays.
 */
function buildIDF(tokenizedDocs: string[][]): Map<string, number> {
  const N = tokenizedDocs.length;
  const df = new Map<string, number>();
  for (const doc of tokenizedDocs) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, n] of df) {
    idf.set(t, Math.log(1 + N / n)); // smoothed to avoid log(0)
  }
  return idf;
}

/**
 * Builds TF-IDF vectors for a corpus of texts.
 * Returns the shared vocabulary and one dense vector per text.
 *
 * @param texts - Array of document strings.
 * @returns Shared vocabulary array and parallel array of TF-IDF vectors.
 */
export function buildTFIDFVectors(texts: string[]): {
  vocabulary: string[];
  vectors: number[][];
} {
  if (texts.length === 0) return { vocabulary: [], vectors: [] };

  const tokenized = texts.map(tokenize);
  const idf = buildIDF(tokenized);
  const vocabulary = [...idf.keys()];
  const termIdx = new Map(vocabulary.map((t, i) => [t, i] as [string, number]));

  const vectors: number[][] = tokenized.map((tokens) => {
    const tf = buildTF(tokens);
    const vec = new Array<number>(vocabulary.length).fill(0);
    for (const [t, tfVal] of tf) {
      const idx = termIdx.get(t);
      if (idx !== undefined) {
        vec[idx] = tfVal * (idf.get(t) ?? 0);
      }
    }
    return vec;
  });

  return { vocabulary, vectors };
}

// ── Similarity ─────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length vectors.
 * Returns 0 if either vector is zero.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns Similarity in [0, 1].
 */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? Math.min(1, dot / denom) : 0;
}

// ── Vocabulary overlap (for criterion matching) ────────────────────────────

/**
 * Fraction of query tokens that appear in the target text.
 * Better than TF-IDF cosine for short query → long document matching
 * (e.g. venue criterion description → paper section).
 *
 * @param query - Short query text (e.g. criterion description).
 * @param target - Longer target text (e.g. paper section).
 * @returns Score in [0, 1]: 1.0 = all query terms found in target.
 */
export function vocabularyOverlap(query: string, target: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return 0;

  const targetTokens = new Set(tokenize(target));
  let matched = 0;
  for (const t of queryTokens) {
    if (targetTokens.has(t)) matched++;
  }
  return matched / queryTokens.size;
}
