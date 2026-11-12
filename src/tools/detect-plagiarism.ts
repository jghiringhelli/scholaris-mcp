/**
 * detect_plagiarism tool.
 *
 * Compares a source paper against one or more reference papers to detect
 * potential plagiarism at two levels:
 *
 *   1. Topical similarity  — TF-IDF cosine on full text or abstract.
 *   2. Verbatim similarity — Word 5-gram Jaccard on sentence pairs.
 *
 * Input can be provided as:
 *   a) Full plain text (most accurate)
 *   b) DOI strings — Semantic Scholar is queried for abstract + metadata.
 *      When only abstracts are available, analysis is abstract-scoped and
 *      the report clearly flags this limitation.
 *
 * Typical use case: a researcher suspects a recently published paper
 * reproduces their prior work without attribution.
 */

import { z } from "zod";
import { buildTFIDFVectors, cosineSim } from "../analyzers/tfidf.js";
import { documentNgramSimilarity, findSuspiciousPassages } from "../analyzers/ngram.js";
import { resolveByDoi, S2ApiError } from "../shared/clients/semantic-scholar.js";
import { logger } from "../shared/logger/index.js";
import type {
  HandlerResult,
  PaperSimilarityResult,
  PlagiarismReport,
  PlagiarismRiskTier,
  SuspiciousPassage,
} from "../shared/types.js";

const MODULE = "tools/detect-plagiarism";

// ── Schema ──────────────────────────────────────────────────────────────────

export const detectPlagiarismSchema = z.object({
  source_paper_text: z
    .string()
    .optional()
    .describe(
      "Full plain text of the paper being investigated. " +
        "Provide this OR source_doi. Full text gives the most accurate analysis."
    ),
  source_doi: z
    .string()
    .optional()
    .describe(
      "DOI of the paper being investigated (e.g. '10.64898/2026.02.25.708045'). " +
        "Used to fetch metadata from Semantic Scholar when full text is unavailable."
    ),
  reference_paper_texts: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "Full plain texts of your reference papers (your prior work). " +
        "Provide these OR reference_dois. Max 5."
    ),
  reference_dois: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "DOIs of your reference papers. " +
        "Used to fetch metadata when full texts are not provided. Max 5."
    ),
  similarity_threshold: z
    .number()
    .min(0.05)
    .max(0.9)
    .optional()
    .default(0.20)
    .describe(
      "Minimum Jaccard score to report a suspicious passage (default 0.20). " +
        "Lower = more results, higher = only near-verbatim matches."
    ),
});

export type DetectPlagiarismArgs = z.infer<typeof detectPlagiarismSchema>;

// ── Paper content resolution ────────────────────────────────────────────────

interface ResolvedPaper {
  title: string | null;
  doi: string | null;
  authors: string;
  year: number | null;
  text: string;
  abstractOnly: boolean;
}

/** Builds a ResolvedPaper from raw provided text (no API call needed). */
function fromText(text: string, index: number): ResolvedPaper {
  return {
    title: extractTitleFromText(text) ?? `Paper ${index + 1}`,
    doi: null,
    authors: "",
    year: null,
    text,
    abstractOnly: false,
  };
}

/** Resolves a DOI via Semantic Scholar and returns whatever text is available. */
async function fromDoi(doi: string): Promise<ResolvedPaper> {
  const paper = await resolveByDoi(doi);

  if (!paper) {
    return {
      title: null,
      doi,
      authors: "",
      year: null,
      text: "",
      abstractOnly: true,
    };
  }

  const text = [paper.title ?? "", paper.abstract ?? ""].join("\n\n").trim();
  const authorStr =
    (paper.authors ?? []).slice(0, 3).map((a) => a.name).join(", ") +
    ((paper.authors ?? []).length > 3 ? " et al." : "");

  return {
    title: paper.title ?? null,
    doi,
    authors: authorStr,
    year: paper.year ?? null,
    text,
    abstractOnly: true, // DOI resolution only gives us abstract
  };
}

/**
 * Naively extracts a title from plain text by taking the first non-empty line
 * that looks like a title (≤200 chars, not starting with a section marker).
 */
function extractTitleFromText(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
  const candidate = lines.find(
    (l) =>
      l.length <= 200 &&
      !/^(abstract|introduction|keywords?|doi:|https?:)/i.test(l) &&
      !/^#/.test(l)
  );
  return candidate ?? null;
}

// ── Similarity computation ──────────────────────────────────────────────────

/**
 * Derives a combined risk tier from cosine and Jaccard scores.
 * Jaccard dominates: a high Jaccard score indicates near-verbatim copying
 * regardless of overall topical overlap.
 */
function deriveTier(cosine: number, jaccard: number): PlagiarismRiskTier {
  if (jaccard >= 0.25 || cosine >= 0.65) return "high-risk";
  if (jaccard >= 0.12 || cosine >= 0.40) return "moderate";
  return "low";
}

/**
 * Computes full similarity report for a source paper against a single reference.
 */
function computeSimilarity(
  source: ResolvedPaper,
  reference: ResolvedPaper,
  threshold: number,
): PaperSimilarityResult {
  const texts = [source.text, reference.text];
  const { vectors } = buildTFIDFVectors(texts);
  const cosine = vectors.length >= 2
    ? cosineSim(vectors[0]!, vectors[1]!)
    : 0;

  const jaccard = documentNgramSimilarity(source.text, reference.text, 5);

  const passages: SuspiciousPassage[] = findSuspiciousPassages(
    source.text,
    reference.text,
    threshold,
    5,
    5,
  );

  return {
    referenceTitle: reference.title ?? "Unknown",
    referenceDoi: reference.doi,
    referenceAuthors: reference.authors,
    referenceYear: reference.year,
    abstractOnly: source.abstractOnly || reference.abstractOnly,
    cosineSimilarity: parseFloat(cosine.toFixed(3)),
    ngramJaccard: parseFloat(jaccard.toFixed(3)),
    tier: deriveTier(cosine, jaccard),
    suspiciousPassages: passages,
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────

/**
 * @param args - Validated DetectPlagiarismArgs.
 * @returns HandlerResult with the plagiarism report as markdown.
 */
export async function detectPlagiarismHandler(
  args: DetectPlagiarismArgs
): Promise<HandlerResult> {
  const { source_paper_text, source_doi, reference_paper_texts, reference_dois } = args;
  const threshold = args.similarity_threshold ?? 0.20;

  if (!source_paper_text && !source_doi) {
    return {
      content: [{ type: "text", text: "Provide either `source_paper_text` or `source_doi`." }],
      isError: true,
    };
  }
  if (!reference_paper_texts?.length && !reference_dois?.length) {
    return {
      content: [{ type: "text", text: "Provide either `reference_paper_texts` or `reference_dois`." }],
      isError: true,
    };
  }

  logger.info(MODULE, "Plagiarism detection starting", {
    hasSrcText: !!source_paper_text,
    srcDoi: source_doi,
    nRefTexts: reference_paper_texts?.length ?? 0,
    nRefDois: reference_dois?.length ?? 0,
  });

  // ── Step 1: Resolve source paper ─────────────────────────────────────────

  let source: ResolvedPaper;
  const apiErrors: string[] = [];

  if (source_paper_text) {
    source = fromText(source_paper_text, 0);
  } else {
    try {
      source = await fromDoi(source_doi!);
      if (!source.text) {
        return {
          content: [{
            type: "text",
            text: `Could not retrieve content for source DOI \`${source_doi}\`. ` +
              "The paper may not be indexed in Semantic Scholar. " +
              "Paste the paper text directly using `source_paper_text`.",
          }],
          isError: true,
        };
      }
    } catch (err) {
      const msg = err instanceof S2ApiError ? err.message : String(err);
      return { content: [{ type: "text", text: `DOI resolution failed: ${msg}` }], isError: true };
    }
  }

  // ── Step 2: Resolve reference papers ─────────────────────────────────────

  const references: ResolvedPaper[] = [];

  if (reference_paper_texts?.length) {
    references.push(...reference_paper_texts.map((t, i) => fromText(t, i)));
  } else {
    for (const doi of reference_dois!) {
      try {
        const ref = await fromDoi(doi);
        if (!ref.text) {
          apiErrors.push(`DOI ${doi}: not found in Semantic Scholar.`);
        } else {
          references.push(ref);
        }
      } catch (err) {
        const msg = err instanceof S2ApiError ? err.message : String(err);
        apiErrors.push(`DOI ${doi}: ${msg}`);
      }
    }
  }

  if (references.length === 0) {
    return {
      content: [{
        type: "text",
        text: [
          "Could not resolve any reference papers.",
          ...apiErrors.map((e) => `- ${e}`),
          "Try providing `reference_paper_texts` directly.",
        ].join("\n"),
      }],
      isError: true,
    };
  }

  // ── Step 3: Compute similarity for each reference ─────────────────────────

  const results: PaperSimilarityResult[] = references.map((ref) =>
    computeSimilarity(source, ref, threshold)
  );

  const report: PlagiarismReport = {
    sourceTitle: source.title,
    sourceDoi: source.doi,
    abstractOnly: source.abstractOnly || results.some((r) => r.abstractOnly),
    results,
    summary: buildSummary(results),
  };

  return {
    content: [{ type: "text", text: renderReport(report, apiErrors) }],
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderReport(report: PlagiarismReport, apiErrors: string[]): string {
  const lines: string[] = [
    "# Plagiarism Analysis Report",
    "",
  ];

  const srcLabel = report.sourceTitle
    ? `"${report.sourceTitle}"`
    : report.sourceDoi
      ? `DOI: \`${report.sourceDoi}\``
      : "Provided source paper";

  lines.push(`**Source paper:** ${srcLabel}`);

  if (report.abstractOnly) {
    lines.push(
      "",
      "> **Scope:** Analysis is limited to **abstracts and metadata** — full text was not available.",
      "> For a definitive plagiarism assessment, provide full paper texts via `source_paper_text`",
      "> and `reference_paper_texts`.",
    );
  }

  lines.push("", `**Summary:** ${report.summary}`, "");

  if (apiErrors.length > 0) {
    lines.push(
      "> **Partial results** — some reference papers could not be fetched:",
      ...apiErrors.map((e) => `> - ${e}`),
      "",
    );
  }

  // ── Per-reference results ─────────────────────────────────────────────────
  for (const r of report.results) {
    const badge = tierBadge(r.tier);
    lines.push(
      `## ${badge} ${r.referenceTitle}`,
      "",
    );

    if (r.referenceDoi || r.referenceAuthors || r.referenceYear) {
      const meta: string[] = [];
      if (r.referenceAuthors) meta.push(`**Authors:** ${r.referenceAuthors}`);
      if (r.referenceYear) meta.push(`**Year:** ${r.referenceYear}`);
      if (r.referenceDoi) meta.push(`**DOI:** \`${r.referenceDoi}\``);
      lines.push(meta.join(" · "), "");
    }

    if (r.abstractOnly) {
      lines.push("> _Abstract-scope analysis only._", "");
    }

    lines.push("### Similarity scores", "");
    lines.push(
      "| Metric | Score | Interpretation |",
      "|--------|-------|----------------|",
      `| TF-IDF cosine similarity | ${pct(r.cosineSimilarity)} | Topical / vocabulary overlap |`,
      `| 5-gram Jaccard similarity | ${pct(r.ngramJaccard)} | Near-verbatim copying |`,
      "",
    );

    if (r.suspiciousPassages.length > 0) {
      lines.push(
        `### Top suspicious passages (threshold ≥ ${Math.round(r.suspiciousPassages[0]!.score * 100)}%+ similarity shown)`,
        "",
      );
      for (const p of r.suspiciousPassages) {
        lines.push(
          `**Score: ${pct(p.score)}**`,
          "",
          `> **Source:** ${truncate(p.sourcePassage, 300)}`,
          `>`,
          `> **Reference:** ${truncate(p.referencePassage, 300)}`,
          "",
        );
      }
    } else {
      lines.push("_No suspicious passage pairs above threshold._", "");
    }
  }

  // ── Methodology note ──────────────────────────────────────────────────────
  lines.push(
    "─".repeat(70),
    "",
    "**Methodology:**",
    "- **TF-IDF cosine** — measures topical vocabulary overlap (shared key terms).",
    "- **5-gram Jaccard** — measures near-verbatim copying (shared 5-word sequences).",
    "- Tiers: 🔴 High-risk (Jaccard ≥ 0.25 or cosine ≥ 0.65) · 🟠 Moderate · 🟢 Low.",
    "- This tool is an aid, not a verdict. False positives occur in narrow domains",
    "  that share heavy technical vocabulary. Always verify suspicious passages manually.",
  );

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function tierBadge(tier: PlagiarismRiskTier): string {
  switch (tier) {
    case "high-risk": return "🔴 High-risk";
    case "moderate":  return "🟠 Moderate";
    case "low":       return "🟢 Low similarity";
  }
}

function buildSummary(results: PaperSimilarityResult[]): string {
  const highRisk = results.filter((r) => r.tier === "high-risk").length;
  const moderate = results.filter((r) => r.tier === "moderate").length;
  const low = results.filter((r) => r.tier === "low").length;
  const parts: string[] = [];
  if (highRisk > 0) parts.push(`${highRisk} high-risk match(es)`);
  if (moderate > 0) parts.push(`${moderate} moderate match(es)`);
  if (low > 0) parts.push(`${low} low-similarity match(es)`);
  return parts.length > 0 ? parts.join(", ") + "." : "No significant similarity detected.";
}
