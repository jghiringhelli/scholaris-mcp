/**
 * check_citations tool.
 *
 * Semantic citation protection for independent researchers.
 *
 * Given the user's paper, it:
 *   1. Extracts key claim phrases (or uses provided claims)
 *   2. Queries Semantic Scholar for papers with high vocabulary overlap
 *   3. For each result, checks whether it cites the user's paper
 *   4. Returns a ranked list of potential citation omissions
 *
 * This protects solo researchers who lack institutional monitoring services
 * (Google Scholar alerts, institutional citation trackers, etc.).
 *
 * Network: Makes up to (max_claims × max_results_per_claim) + 1 API calls.
 * Rate-limited to 1 req/sec to stay within the unauthenticated S2 tier.
 */

import { z } from "zod";
import { parseSections } from "../analyzers/section-parser.js";
import { tokenize, buildTFIDFVectors } from "../analyzers/tfidf.js";
import {
  searchPapers,
  paperCitesTitle,
  paperUrl,
  normaliseTitle,
  S2ApiError,
} from "../shared/clients/semantic-scholar.js";
import { logger } from "../shared/logger/index.js";
import type {
  HandlerResult,
  CitationOmission,
  CitationReport,
  SimilarityTier,
  S2Paper,
} from "../shared/types.js";
import { vocabularyOverlap } from "../analyzers/tfidf.js";

const MODULE = "tools/check-citations";

// ── Schema ──────────────────────────────────────────────────────────────────

export const checkCitationsSchema = z.object({
  paper_text: z
    .string()
    .min(100)
    .describe("Full text of your paper."),
  paper_title: z
    .string()
    .min(5)
    .describe("Exact title of your paper (used to check if found papers cite you)."),
  paper_authors: z
    .array(z.string())
    .optional()
    .describe("Your author names (for disambiguation when title alone is insufficient)."),
  claims: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "Specific claim phrases to search for (overrides auto-extraction). " +
        "E.g. ['contrastive learning without negatives', 'momentum encoder update']. " +
        "Max 5 claims. If omitted, extracted automatically from abstract."
    ),
  published_after: z
    .string()
    .optional()
    .describe("ISO year (e.g. '2022') — only include result papers published after this year."),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe("Maximum total result papers to return. Default: 10."),
});

export type CheckCitationsArgs = z.infer<typeof checkCitationsSchema>;

// ── Claim extraction ─────────────────────────────────────────────────────────

/**
 * Extracts up to 3 claim search phrases from the paper.
 * Strategy: uses the abstract section's top TF-IDF bigrams to produce
 * discriminating queries that target the paper's specific contributions.
 */
export function extractClaimPhrases(
  paperText: string,
  paperTitle: string
): string[] {
  let sections: ReturnType<typeof parseSections> = [];
  try {
    sections = parseSections(paperText);
  } catch {
    // Paper too short or malformed — fall back to title-only
    return [paperTitle.slice(0, 100)];
  }

  const abstract = sections.find((s) =>
    /^abstract/i.test(s.title)
  );

  // Candidate text: abstract first, fall back to first ~600 chars of paper
  const candidateText =
    abstract?.content ??
    paperText.slice(0, 600);

  // Tokenize and find top-weight unique terms (relative to the whole paper)
  const allText = sections.map((s) => s.content);
  const { vocabulary, vectors } = buildTFIDFVectors([candidateText, ...allText]);

  const abstractVec = vectors[0] ?? [];
  const topTerms = vocabulary
    .map((term, i) => ({ term, weight: abstractVec[i] ?? 0 }))
    .filter((t) => t.weight > 0 && t.term.length > 3)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
    .map((t) => t.term);

  // Build 2-3 word query phrases from consecutive top terms
  const phrases: string[] = [];

  // Phrase 1: paper title itself (most discriminating query)
  phrases.push(paperTitle.slice(0, 100));

  // Phrase 2: top 3 abstract terms joined as a phrase query
  if (topTerms.length >= 3) {
    phrases.push(topTerms.slice(0, 3).join(" "));
  }

  // Phrase 3: next 3 terms (different facet of the paper)
  if (topTerms.length >= 6) {
    phrases.push(topTerms.slice(3, 6).join(" "));
  }

  return phrases.filter((p) => p.trim().length > 5);
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function checkCitationsHandler(
  args: CheckCitationsArgs
): Promise<HandlerResult> {
  logger.info(MODULE, "Citation check starting", {
    paperTitle: args.paper_title,
    claimsProvided: args.claims?.length ?? 0,
    publishedAfter: args.published_after,
    maxResults: args.max_results,
  });

  const afterYear = args.published_after ? parseInt(args.published_after, 10) : null;

  // ── Step 1: Determine claim search phrases ───────────────────────────────
  const claimPhrases: string[] =
    args.claims && args.claims.length > 0
      ? args.claims.slice(0, 5)
      : extractClaimPhrases(args.paper_text, args.paper_title);

  logger.info(MODULE, "Searching with claims", { claimPhrases });

  // ── Step 2: Query Semantic Scholar ───────────────────────────────────────
  const resultMap = new Map<string, S2Paper>(); // paperId → paper (deduped)
  const claimForPaper = new Map<string, string>(); // paperId → matched claim
  const apiErrors: string[] = [];

  const perClaimLimit = Math.ceil((args.max_results ?? 10) / claimPhrases.length);

  for (const claim of claimPhrases) {
    try {
      const results = await searchPapers(claim, Math.min(perClaimLimit + 2, 10));
      for (const paper of results) {
        if (!resultMap.has(paper.paperId)) {
          resultMap.set(paper.paperId, paper);
          claimForPaper.set(paper.paperId, claim);
        }
      }
    } catch (err) {
      const msg = err instanceof S2ApiError ? err.message : String(err);
      apiErrors.push(`Query "${claim.slice(0, 50)}": ${msg}`);
      logger.warn(MODULE, "S2 API error", { claim, error: msg });
    }
  }

  const totalScanned = resultMap.size;
  logger.info(MODULE, "S2 results fetched", { total: totalScanned, errors: apiErrors.length });

  // ── Step 3: Score and classify each result ───────────────────────────────
  const allClaims = claimPhrases.join(" ");
  const omissions: CitationOmission[] = [];
  const citing: CitationOmission[] = [];

  for (const [paperId, paper] of resultMap) {
    // Skip the user's own paper (title match)
    if (normaliseTitle(paper.title) === normaliseTitle(args.paper_title)) continue;

    // Optional year filter
    if (afterYear !== null && paper.year !== null && paper.year <= afterYear) continue;

    // Vocabulary overlap as similarity proxy
    const targetText = [paper.title, paper.abstract ?? ""].join(" ");
    const overlapScore = vocabularyOverlap(allClaims, targetText);
    const similarityTier = scoreTier(overlapScore);

    const citesYou = paperCitesTitle(paper, args.paper_title);
    const authorStr = paper.authors.slice(0, 3).map((a) => a.name).join(", ") +
      (paper.authors.length > 3 ? " et al." : "");

    const entry: CitationOmission = {
      paperId,
      title: paper.title,
      authors: authorStr || "Unknown",
      year: paper.year,
      url: paperUrl(paper),
      matchedClaim: claimForPaper.get(paperId) ?? claimPhrases[0] ?? "",
      similarityTier,
      overlapScore: parseFloat(overlapScore.toFixed(3)),
      citesYourWork: citesYou,
    };

    if (citesYou) {
      citing.push(entry);
    } else {
      omissions.push(entry);
    }
  }

  // Sort omissions: high similarity first (most urgent)
  omissions.sort((a, b) => b.overlapScore - a.overlapScore);
  citing.sort((a, b) => b.overlapScore - a.overlapScore);

  // Cap to max_results
  const cappedOmissions = omissions.slice(0, args.max_results ?? 10);

  const report: CitationReport = {
    queriedClaims: claimPhrases,
    omissions: cappedOmissions,
    citing,
    totalResultsScanned: totalScanned,
    apiErrors,
    summary: buildSummary(cappedOmissions.length, citing.length, totalScanned, apiErrors),
  };

  return { content: [{ type: "text", text: renderReport(report, args.paper_title) }] };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderReport(report: CitationReport, paperTitle: string): string {
  const lines: string[] = [
    "# Citation Protection Report",
    "",
    `**Your paper:** "${paperTitle}"`,
    `**Scanned:** ${report.totalResultsScanned} papers from Semantic Scholar`,
    `**Queries used:** ${report.queriedClaims.map((c) => `\`${c.slice(0, 60)}\``).join(", ")}`,
    "",
  ];

  if (report.apiErrors.length > 0) {
    lines.push(
      "> ⚠️ **Partial results** — some queries failed:",
      ...report.apiErrors.map((e) => `> - ${e}`),
      ""
    );
  }

  // ── Potential omissions ────────────────────────────────────────────────
  if (report.omissions.length === 0) {
    lines.push("## ✅ No Potential Citation Omissions Found", "");
    lines.push(
      "All topically similar papers in the corpus appear to cite your work, or no similar papers were found.",
      ""
    );
  } else {
    lines.push(
      `## ⚠️ Potential Citation Omissions (${report.omissions.length})`,
      "",
      "These papers share vocabulary with your claims but do not appear to cite you.",
      "Not all are true omissions — some may predate your work or be tangentially related.",
      "",
      "| Title | Authors | Year | Similarity | URL |",
      "|-------|---------|------|-----------|-----|"
    );
    for (const p of report.omissions) {
      const tier = tierBadge(p.similarityTier);
      lines.push(
        `| ${truncate(p.title, 60)} | ${truncate(p.authors, 30)} | ${p.year ?? "?"} | ${tier} (${(p.overlapScore * 100).toFixed(0)}%) | [→](${p.url}) |`
      );
    }
    lines.push("");

    // Details for high-similarity omissions
    const highPriority = report.omissions.filter((p) => p.similarityTier === "high");
    if (highPriority.length > 0) {
      lines.push("### High-priority omissions (most likely to be relevant)");
      lines.push("");
      for (const p of highPriority) {
        lines.push(`**${p.title}**`);
        lines.push(`- Authors: ${p.authors} | Year: ${p.year ?? "unknown"}`);
        lines.push(`- Matched via: \`${p.matchedClaim.slice(0, 80)}\``);
        lines.push(`- URL: ${p.url}`);
        lines.push("");
      }
    }
  }

  // ── Papers that cite you ───────────────────────────────────────────────
  if (report.citing.length > 0) {
    lines.push(
      `## ✅ Papers That Cite Your Work (${report.citing.length})`,
      "",
      "| Title | Authors | Year |",
      "|-------|---------|------|"
    );
    for (const p of report.citing) {
      lines.push(`| ${truncate(p.title, 60)} | ${truncate(p.authors, 30)} | ${p.year ?? "?"} |`);
    }
    lines.push("");
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  lines.push(
    "─".repeat(70),
    "",
    "> **Methodology:** Vocabulary-overlap scoring against paper titles and abstracts.",
    "> Citation check uses reference list title matching — may miss citing papers that",
    "> use a non-standard title abbreviation. Set `SEMANTIC_SCHOLAR_API_KEY` in the",
    "> environment to increase query rate for larger scans.",
    "",
    `\`files_created\`: []`,
    `\`next_steps\`: [${
      report.omissions.length > 0
        ? `"Contact authors of high-priority omissions to request citation.", "Add persistent monitoring with Google Scholar Alerts for your title.", `
        : ""
    }"Run check_citations again after next paper revision to monitor new publications."]`
  );

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreTier(overlap: number): SimilarityTier {
  if (overlap >= 0.40) return "high";
  if (overlap >= 0.20) return "moderate";
  return "low";
}

function tierBadge(tier: SimilarityTier): string {
  switch (tier) {
    case "high":     return "🔴 High";
    case "moderate": return "🟠 Moderate";
    case "low":      return "🟡 Low";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function buildSummary(
  omissions: number,
  citing: number,
  scanned: number,
  errors: string[]
): string {
  const parts: string[] = [
    `Scanned ${scanned} papers.`,
    `${omissions} potential omission(s) found.`,
    `${citing} paper(s) already citing your work.`,
  ];
  if (errors.length > 0) parts.push(`${errors.length} query error(s) — partial results.`);
  return parts.join(" ");
}
