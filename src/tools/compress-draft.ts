/**
 * compress_draft tool (free tier).
 *
 * Applies Saint-Exupéry's minimalism test to prose:
 * a work is finished not when nothing remains to add, but when nothing remains to remove.
 *
 * For each section the tool returns one of five verdicts:
 *   load-bearing — unique content; do not touch
 *   remove       — near-duplicate of an earlier section; the earlier one wins
 *   compress     — moderate overlap or disproportionate length; tighten
 *   relocate     — important content in the wrong position
 *   review       — borderline; human judgment required
 *
 * Algorithm:
 *   1. Parse sections.
 *   2. Build TF-IDF vectors; compute pairwise cosine similarity.
 *   3. Assign verdicts from similarity + positional + length rules.
 *   4. For the top-K most similar pairs run sentence-level n-gram analysis
 *      to surface specific repeated passages.
 *   5. Render a structured report.
 *
 * No external API calls. All computation is local.
 */

import { z } from "zod";
import { parseSections } from "../analyzers/section-parser.js";
import { buildTFIDFVectors, cosineSim } from "../analyzers/tfidf.js";
import { findSuspiciousPassages } from "../analyzers/ngram.js";
import { logger } from "../shared/logger/index.js";
import type {
  HandlerResult,
  CompressionReport,
  CompressionPassagePair,
  CompressionVerdict,
  SectionCompressionResult,
} from "../shared/types.js";
import type { PaperSection } from "../shared/types.js";

const MODULE = "tools/compress-draft";

// ── Schema ──────────────────────────────────────────────────────────────────

export const compressDraftSchema = z.object({
  paper_text: z
    .string()
    .min(200)
    .describe("Full text of the document to audit for compression."),
  mode: z
    .enum(["aggressive", "moderate", "light"])
    .optional()
    .default("moderate")
    .describe(
      "Sensitivity of the compression audit. " +
        "'aggressive' flags more for removal; 'light' flags only the clearest redundancies. " +
        "Default: 'moderate'."
    ),
});

export type CompressDraftArgs = z.infer<typeof compressDraftSchema>;

// ── Similarity thresholds by mode ───────────────────────────────────────────

interface Thresholds {
  readonly remove: number;    // cosine ≥ this AND section appears after source → remove
  readonly compress: number;  // cosine ≥ this → compress
  readonly relocate: number;  // cosine ≥ this with a distant section → relocate
}

function thresholdsFor(mode: "aggressive" | "moderate" | "light"): Thresholds {
  switch (mode) {
    case "aggressive": return { remove: 0.55, compress: 0.35, relocate: 0.40 };
    case "light":      return { remove: 0.75, compress: 0.55, relocate: 0.60 };
    default:           return { remove: 0.65, compress: 0.45, relocate: 0.50 };
  }
}

// ── Verdict assignment ───────────────────────────────────────────────────────

/**
 * Returns 0-based "zone" index (0 = first third, 1 = middle, 2 = last third).
 */
function zone(index: number, total: number): number {
  return Math.floor((index / total) * 3);
}

/**
 * Assigns a verdict to one section given its similarity row to all other sections.
 */
function assignVerdict(
  section: PaperSection,
  totalSections: number,
  simRow: ReadonlyArray<number>,
  sections: ReadonlyArray<PaperSection>,
  totalWords: number,
  thresholds: Thresholds,
): SectionCompressionResult {
  const wordCount = countWords(section.content);
  const pctOfTotal = totalWords > 0 ? parseFloat(((wordCount / totalWords) * 100).toFixed(1)) : 0;

  let maxSim = 0;
  let maxSimIdx = -1;

  for (let j = 0; j < simRow.length; j++) {
    if (j === section.index) continue;
    const s = simRow[j] ?? 0;
    if (s > maxSim) { maxSim = s; maxSimIdx = j; }
  }

  const mostSimilarSection = maxSimIdx >= 0 ? sections[maxSimIdx]?.title : undefined;
  const verdict = deriveVerdict(section, maxSim, maxSimIdx, pctOfTotal, totalSections, thresholds);
  const reason = buildReason(verdict, maxSim, mostSimilarSection, pctOfTotal, section, totalSections);

  return {
    sectionId: section.id,
    sectionTitle: section.title,
    wordCount,
    pctOfTotal,
    verdict,
    reason,
    mostSimilarSection,
    maxCosineSimilarity: parseFloat(maxSim.toFixed(3)),
  };
}

function deriveVerdict(
  section: PaperSection,
  maxSim: number,
  maxSimIdx: number,
  pctOfTotal: number,
  totalSections: number,
  t: Thresholds,
): CompressionVerdict {
  // Disproportionate length alone triggers compress regardless of similarity
  if (pctOfTotal > 30) return "compress";

  if (maxSim >= t.remove) {
    // Later section is the duplicate; earlier section is the source
    return section.index > maxSimIdx ? "remove" : "compress";
  }

  // Similar content in a different zone of the document → possible misplacement
  if (maxSim >= t.relocate && maxSimIdx >= 0) {
    const myZone = zone(section.index, totalSections);
    const theirZone = zone(maxSimIdx, totalSections);
    if (Math.abs(myZone - theirZone) >= 2) return "relocate";
  }

  if (maxSim >= t.compress) return "compress";
  if (maxSim >= t.compress * 0.7) return "review";
  return "load-bearing";
}

function buildReason(
  verdict: CompressionVerdict,
  maxSim: number,
  mostSimilarSection: string | undefined,
  pctOfTotal: number,
  section: PaperSection,
  totalSections: number,
): string {
  switch (verdict) {
    case "remove":
      return `${pct(maxSim)} cosine overlap with "${mostSimilarSection ?? "earlier section"}" — appears later; earlier occurrence is the source.`;
    case "compress":
      if (pctOfTotal > 30)
        return `${pctOfTotal}% of total document length — disproportionate; distil to its essential argument.`;
      return `${pct(maxSim)} cosine overlap with "${mostSimilarSection ?? "another section"}" — consolidate or cut the repeated material.`;
    case "relocate":
      return `${pct(maxSim)} cosine overlap with "${mostSimilarSection ?? "a distant section"}" located in a different structural zone — content may belong there.`;
    case "review":
      return `${pct(maxSim)} cosine overlap with "${mostSimilarSection ?? "another section"}" — borderline; check whether the distinction justifies the duplication.`;
    case "load-bearing":
      return maxSim < 0.15
        ? "Unique content — no significant topical overlap with any other section."
        : `Low overlap (${pct(maxSim)}) — content is largely distinct.`;
  }
}

// ── Structural alerts ────────────────────────────────────────────────────────

/**
 * Returns plain-English alerts for structural anomalies.
 */
function buildStructuralAlerts(
  sections: ReadonlyArray<PaperSection>,
  totalWords: number,
): ReadonlyArray<string> {
  const alerts: string[] = [];
  const sectionWords = sections.map((s) => countWords(s.content));

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const w = sectionWords[i] ?? 0;
    const p = totalWords > 0 ? (w / totalWords) * 100 : 0;

    if (/^abstract/i.test(s.title) && p > 8) {
      alerts.push(`Abstract is ${p.toFixed(0)}% of total length (expected ≤ 5%). A white paper abstract should distil; this one restates.`);
    }
    if (/^introduction/i.test(s.title) && p > 20) {
      alerts.push(`Introduction is ${p.toFixed(0)}% of total length — may be absorbing content that belongs in a dedicated section.`);
    }
    if (p > 30 && !/^abstract/i.test(s.title) && !/^introduction/i.test(s.title)) {
      alerts.push(`"${s.title}" is ${p.toFixed(0)}% of total — a single section this large is usually several sections that haven't been split yet.`);
    }
    if (w < 60 && s.level === 1) {
      alerts.push(`"${s.title}" is only ${w} words — either underdeveloped or a misplaced fragment that belongs in an adjacent section.`);
    }
  }

  return alerts;
}

// ── Repetition pairs ─────────────────────────────────────────────────────────

/**
 * Finds specific repeated passages for the top-K section pairs by cosine similarity.
 * Limits expensive sentence-level work to the most similar pairs only.
 */
function findRepetitionPairs(
  sections: ReadonlyArray<PaperSection>,
  cosineMatrix: ReadonlyArray<ReadonlyArray<number>>,
  topK = 5,
  jaccardThreshold = 0.20,
): ReadonlyArray<CompressionPassagePair> {
  // Collect all unique (i, j) pairs sorted by similarity descending
  type Pair = { i: number; j: number; sim: number };
  const pairs: Pair[] = [];

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const sim = cosineMatrix[i]?.[j] ?? 0;
      if (sim > 0.30) pairs.push({ i, j, sim });
    }
  }

  pairs.sort((a, b) => b.sim - a.sim);

  const result: CompressionPassagePair[] = [];

  for (const { i, j } of pairs.slice(0, topK)) {
    const si = sections[i]!;
    const sj = sections[j]!;
    const passages = findSuspiciousPassages(si.content, sj.content, jaccardThreshold, 2, 5);

    for (const p of passages) {
      result.push({
        section1Title: si.title,
        section2Title: sj.title,
        passage1: p.sourcePassage,
        passage2: p.referencePassage,
        jaccardScore: parseFloat(p.score.toFixed(3)),
      });
    }
  }

  return result.sort((a, b) => b.jaccardScore - a.jaccardScore).slice(0, 8);
}

// ── Redundancy estimate ──────────────────────────────────────────────────────

/**
 * Estimates fraction of total words that are redundant based on verdict weights.
 */
function estimateRedundancy(
  sections: ReadonlyArray<SectionCompressionResult>,
  totalWords: number,
): number {
  if (totalWords === 0) return 0;
  let redundantWords = 0;
  for (const s of sections) {
    if (s.verdict === "remove")   redundantWords += s.wordCount;
    if (s.verdict === "compress") redundantWords += Math.floor(s.wordCount * 0.45);
  }
  return parseFloat(Math.min(redundantWords / totalWords, 0.95).toFixed(2));
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * @param args - Validated CompressDraftArgs.
 * @returns HandlerResult with the compression report as markdown.
 */
export async function compressDraftHandler(
  args: CompressDraftArgs,
): Promise<HandlerResult> {
  logger.info(MODULE, "Compression audit starting", { mode: args.mode });

  const sections = parseSections(args.paper_text);
  const texts = sections.map((s) => s.content);
  const totalWords = texts.reduce((n, t) => n + countWords(t), 0);

  logger.info(MODULE, "Sections parsed", { count: sections.length, totalWords });

  const { vectors } = buildTFIDFVectors(texts);
  const cosineMatrix = buildCosineMatrix(vectors);

  const t = thresholdsFor(args.mode ?? "moderate");
  const sectionResults: SectionCompressionResult[] = sections.map((s) =>
    assignVerdict(s, sections.length, cosineMatrix[s.index] ?? [], sections, totalWords, t)
  );

  const structuralAlerts = buildStructuralAlerts(sections, totalWords);
  const repetitionPairs = findRepetitionPairs(sections, cosineMatrix);
  const estimatedRedundancyPct = estimateRedundancy(sectionResults, totalWords);

  const report: CompressionReport = {
    totalWords,
    totalSections: sections.length,
    estimatedRedundancyPct,
    structuralAlerts,
    repetitionPairs,
    sections: sectionResults,
    summary: buildSummary(sectionResults, totalWords, estimatedRedundancyPct),
  };

  return { content: [{ type: "text", text: renderReport(report) }] };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderReport(report: CompressionReport): string {
  const lines: string[] = [
    "# Compression Audit",
    "",
    "> *A work is finished not when nothing remains to add, but when nothing remains to remove.*",
    "> — Antoine de Saint-Exupéry",
    "",
    `**Document:** ${report.totalWords.toLocaleString()} words · ${report.totalSections} sections`,
    `**Estimated redundancy:** ${(report.estimatedRedundancyPct * 100).toFixed(0)}%`,
    "",
    `**${report.summary}**`,
    "",
  ];

  if (report.structuralAlerts.length > 0) {
    lines.push("## Structural Alerts", "");
    for (const a of report.structuralAlerts) lines.push(`- ${a}`);
    lines.push("");
  }

  // Section table
  lines.push("## Section-by-Section Verdicts", "");
  lines.push("| Section | Words | % | Verdict | Reason |");
  lines.push("|---------|-------|---|---------|--------|");

  for (const s of report.sections) {
    const badge = verdictBadge(s.verdict);
    const reason = truncate(s.reason, 100);
    lines.push(`| ${truncate(s.sectionTitle, 45)} | ${s.wordCount} | ${s.pctOfTotal}% | ${badge} | ${reason} |`);
  }
  lines.push("");

  // Specific repeated passages
  if (report.repetitionPairs.length > 0) {
    lines.push("## Repeated Passages", "");
    lines.push("These sentence pairs appear in two different sections. One should go.");
    lines.push("");

    for (const [i, p] of report.repetitionPairs.entries()) {
      lines.push(
        `**[${i + 1}] ${p.section1Title} ↔ ${p.section2Title}** — Jaccard ${pct(p.jaccardScore)}`,
        "",
        `> **§ ${p.section1Title}:** ${truncate(p.passage1, 280)}`,
        `>`,
        `> **§ ${p.section2Title}:** ${truncate(p.passage2, 280)}`,
        "",
      );
    }
  }

  // What to do next
  const removes = report.sections.filter((s) => s.verdict === "remove").map((s) => s.sectionTitle);
  const compresses = report.sections.filter((s) => s.verdict === "compress").map((s) => s.sectionTitle);
  const relocates = report.sections.filter((s) => s.verdict === "relocate").map((s) => s.sectionTitle);
  const reviews = report.sections.filter((s) => s.verdict === "review").map((s) => s.sectionTitle);

  lines.push("## Priority Actions", "");

  const hasActions = removes.length + compresses.length + relocates.length + reviews.length > 0;
  if (!hasActions) {
    lines.push("No redundancy detected. Nothing to remove.");
    lines.push("");
  }

  if (removes.length > 0) {
    lines.push(`**Remove** (${removes.length}): ${removes.map((t) => `"${t}"`).join(", ")}`);
    lines.push("");
  }
  if (compresses.length > 0) {
    lines.push(`**Compress** (${compresses.length}): ${compresses.map((t) => `"${t}"`).join(", ")}`);
    lines.push("");
  }
  if (relocates.length > 0) {
    lines.push(`**Relocate** (${relocates.length}): ${relocates.map((t) => `"${t}"`).join(", ")}`);
    lines.push("");
  }
  if (reviews.length > 0) {
    lines.push(`**Review** (${reviews.length}): ${reviews.map((t) => `"${t}"`).join(", ")}`);
    lines.push("");
    lines.push(`_These sections have borderline overlap with a topically adjacent section. Human judgment required._`);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Utilities ────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Builds the full N×N cosine similarity matrix from TF-IDF vectors.
 */
function buildCosineMatrix(vectors: ReadonlyArray<number[]>): ReadonlyArray<ReadonlyArray<number>> {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const s = cosineSim(vectors[i]!, vectors[j]!);
      matrix[i]![j] = s;
      matrix[j]![i] = s;
    }
  }
  return matrix;
}

function verdictBadge(v: CompressionVerdict): string {
  switch (v) {
    case "load-bearing": return "✅ load-bearing";
    case "remove":       return "🗑️ remove";
    case "compress":     return "✂️ compress";
    case "relocate":     return "📌 relocate";
    case "review":       return "🔍 review";
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function buildSummary(
  sections: ReadonlyArray<SectionCompressionResult>,
  totalWords: number,
  redundancyPct: number,
): string {
  const removes  = sections.filter((s) => s.verdict === "remove").length;
  const compress = sections.filter((s) => s.verdict === "compress").length;
  const relocate = sections.filter((s) => s.verdict === "relocate").length;
  const saveable = Math.round(totalWords * redundancyPct);

  const parts: string[] = [];
  if (removes > 0)  parts.push(`${removes} section(s) to remove`);
  if (compress > 0) parts.push(`${compress} to compress`);
  if (relocate > 0) parts.push(`${relocate} to relocate`);
  if (parts.length === 0) return "No significant redundancy detected.";

  return `${parts.join(", ")} — estimated ${saveable.toLocaleString()} words recoverable (~${(redundancyPct * 100).toFixed(0)}%).`;
}
