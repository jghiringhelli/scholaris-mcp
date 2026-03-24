/**
 * generate_rebuttal tool.
 * Given a set of reviewer comments, generates a structured rebuttal scaffold
 * following academic conventions: acknowledge, clarify, revise.
 */

import { z } from "zod";
import { logger } from "../shared/logger/index.js";
import type { HandlerResult } from "../shared/types.js";
import { buildRebuttalScaffold } from "./rebuttal-scaffold.js";
import type { ReviewerPoint, PointType } from "./rebuttal-scaffold.js";

const MODULE = "tools/generate-rebuttal";

export const generateRebuttalSchema = z.object({
  reviewer_comments: z
    .string()
    .min(50)
    .describe(
      "Raw reviewer comments text (from PDF, email, or review portal). " +
        "Multiple reviewers may be included — label with 'Reviewer 1:' etc. if known."
    ),
  paper_title: z
    .string()
    .optional()
    .describe("Paper title, used in the rebuttal header."),
  venue: z
    .string()
    .optional()
    .describe("Target venue, e.g. 'NeurIPS 2026', 'IEEE TPAMI'. Used in header."),
  tone: z
    .enum(["formal", "collegial", "concise"])
    .optional()
    .default("collegial")
    .describe("Rebuttal tone: formal (highly structured), collegial (warm + professional — default), concise (short point-by-point)."),
});

export type GenerateRebuttalArgs = z.infer<typeof generateRebuttalSchema>;

/**
 * Handles the generate_rebuttal action.
 * Parses reviewer comments into individual points and generates a scaffold
 * the author fills in with paper-specific responses.
 *
 * @param args - Validated input arguments.
 * @returns MCP content item containing the rebuttal scaffold.
 */
export async function generateRebuttalHandler(args: GenerateRebuttalArgs): Promise<HandlerResult> {
  logger.info(MODULE, "Rebuttal generation starting", {
    tone: args.tone,
    venue: args.venue,
    commentsLength: args.reviewer_comments.length,
  });

  const points = parseReviewerPoints(args.reviewer_comments);
  const scaffold = buildRebuttalScaffold(points, args);

  logger.info(MODULE, "Rebuttal scaffold generated", { pointCount: points.length });

  return { content: [{ type: "text", text: scaffold }] };
}

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Splits reviewer comments into individual response points.
 * Handles numbered lists, bullet points, and labeled reviewer blocks.
 *
 * @param raw - Raw reviewer comment text.
 * @returns Array of parsed reviewer points with type and severity classification.
 */
function parseReviewerPoints(raw: string): ReadonlyArray<ReviewerPoint> {
  const points: ReviewerPoint[] = [];
  const reviewerBlocks = splitByReviewer(raw);

  for (const [reviewerId, block] of reviewerBlocks) {
    const items = splitIntoItems(block);
    for (const item of items) {
      if (item.trim().length < 10) continue;
      points.push({
        reviewerId,
        type: classifyPoint(item),
        text: item.trim(),
        severity: estimateSeverity(item),
      });
    }
  }

  return points;
}

/**
 * Splits text into labeled reviewer blocks if reviewer labels are present.
 *
 * @param text - Full reviewer comment text.
 * @returns Array of [reviewerId, blockText] tuples.
 */
function splitByReviewer(text: string): ReadonlyArray<[string, string]> {
  const reviewerPattern = /(?:reviewer\s*#?\s*(\d+)|R(\d+)\s*:)/gi;
  const matches = [...text.matchAll(reviewerPattern)];

  if (matches.length === 0) {
    return [["Reviewer", text]];
  }

  const blocks: [string, string][] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const num = match[1] ?? match[2] ?? String(i + 1);
    const start = match.index! + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    blocks.push([`Reviewer ${num}`, text.slice(start, end).trim()]);
  }
  return blocks;
}

/**
 * Splits a reviewer block into individual response items.
 *
 * @param text - A single reviewer's comment block.
 * @returns Array of individual comment strings.
 */
function splitIntoItems(text: string): ReadonlyArray<string> {
  const byNumbered = text.split(/\n(?=\d+[\.\)]\s)/);
  if (byNumbered.length > 1) return byNumbered;

  const byBullet = text.split(/\n(?=[-•*]\s)/);
  if (byBullet.length > 1) return byBullet;

  return text.split(/\n\n+/).filter((p) => p.trim().length > 20);
}

/**
 * Classifies the type of reviewer point based on language patterns.
 *
 * @param text - The comment text to classify.
 * @returns The point type.
 */
function classifyPoint(text: string): PointType {
  const lower = text.toLowerCase();
  if (/\?/.test(text) || /\bwhy\b|\bwhat\b|\bhow\b|\bclarif/.test(lower)) return "question";
  if (/\bsuggest|\bwould benefit|\bcould be improved|\bshould|\brecommend/.test(lower)) return "suggestion";
  if (/\bexcellent|\bwell-written|\bstrong|\bimpressive|\bnovel|\bgood/.test(lower)) return "praise";
  if (/\bunclear|\bconfusing|\bhard to follow|\bvague|\bnot clear/.test(lower)) return "unclear";
  return "concern";
}

/**
 * Estimates severity from keyword signals.
 *
 * @param text - The comment text to assess.
 * @returns Severity level: "major", "minor", or "curiosity".
 */
function estimateSeverity(text: string): "major" | "minor" | "curiosity" {
  const lower = text.toLowerCase();
  if (/\bmajor|\bfundamental|\bsignificant concern|\bflaw|\binvalid|\bmissing crucial/.test(lower)) return "major";
  if (/\bminor|\btypograph|\bnit|\bwording|\bformat|\bsmall/.test(lower) || text.length < 80) return "minor";
  return "curiosity";
}
