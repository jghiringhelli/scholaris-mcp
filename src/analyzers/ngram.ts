/**
 * N-gram utilities for near-verbatim plagiarism detection.
 *
 * Uses word n-gram Jaccard similarity to detect copied or lightly paraphrased
 * passages. 5-grams are the default: sensitive enough to catch paraphrasing,
 * robust enough to avoid false positives from shared technical vocabulary.
 */

// ── N-gram construction ────────────────────────────────────────────────────

/**
 * Splits text into a set of word n-grams.
 * Lowercases and strips punctuation before windowing so minor formatting
 * differences don't block a match.
 *
 * @param text   - Input text.
 * @param n      - N-gram window size (default 5).
 * @returns Set of space-joined n-gram strings.
 */
export function buildWordNgrams(text: string, n = 5): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(" "));
  }
  return ngrams;
}

// ── Jaccard similarity ────────────────────────────────────────────────────

/**
 * Jaccard similarity between two sets.
 * |A ∩ B| / |A ∪ B|. Returns 0 if both sets are empty.
 *
 * @param a - First set.
 * @param b - Second set.
 * @returns Similarity in [0, 1].
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ── Suspicious passage extraction ─────────────────────────────────────────

export interface SuspiciousPassage {
  /** Sentence from the source (potentially plagiarizing) paper. */
  sourcePassage: string;
  /** The closest-matching sentence in the reference paper. */
  referencePassage: string;
  /** Jaccard similarity score (0–1). */
  score: number;
}

/**
 * Splits text into sentences on sentence-ending punctuation.
 * Conservative: only splits on [.!?] followed by whitespace + uppercase,
 * which avoids splitting on abbreviations like "et al. The".
 */
function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);
}

/**
 * Finds the most suspicious passage pairs between source and reference texts.
 *
 * Each source sentence is compared against all reference sentences.
 * Only pairs with Jaccard score above `threshold` are returned,
 * sorted by score descending and capped at `topN`.
 *
 * @param sourceText    - Text of the paper being scrutinised.
 * @param referenceText - Text of the reference (prior) paper.
 * @param threshold     - Minimum Jaccard score to include (default 0.20).
 * @param topN          - Maximum number of pairs to return (default 5).
 * @param ngramSize     - N-gram window (default 5).
 * @returns Array of suspicious passage pairs, highest score first.
 */
export function findSuspiciousPassages(
  sourceText: string,
  referenceText: string,
  threshold = 0.20,
  topN = 5,
  ngramSize = 5,
): SuspiciousPassage[] {
  const sourceSentences = splitSentences(sourceText);
  const refSentences = splitSentences(referenceText);

  if (sourceSentences.length === 0 || refSentences.length === 0) return [];

  const refNgrams = refSentences.map((s) => buildWordNgrams(s, ngramSize));

  const candidates: SuspiciousPassage[] = [];

  for (const srcSentence of sourceSentences) {
    const srcNgrams = buildWordNgrams(srcSentence, ngramSize);
    if (srcNgrams.size < 2) continue;

    let bestScore = 0;
    let bestRef = "";

    for (let i = 0; i < refSentences.length; i++) {
      const score = jaccardSimilarity(srcNgrams, refNgrams[i]!);
      if (score > bestScore) {
        bestScore = score;
        bestRef = refSentences[i]!;
      }
    }

    if (bestScore >= threshold) {
      candidates.push({ sourcePassage: srcSentence, referencePassage: bestRef, score: bestScore });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ── Document-level n-gram Jaccard ──────────────────────────────────────────

/**
 * Document-level n-gram Jaccard similarity.
 * Treats the entire document as one bag of n-grams. More sensitive to
 * wholesale copying than cosine similarity.
 *
 * @param a         - First document text.
 * @param b         - Second document text.
 * @param ngramSize - N-gram window (default 5).
 * @returns Jaccard score in [0, 1].
 */
export function documentNgramSimilarity(a: string, b: string, ngramSize = 5): number {
  return jaccardSimilarity(buildWordNgrams(a, ngramSize), buildWordNgrams(b, ngramSize));
}
