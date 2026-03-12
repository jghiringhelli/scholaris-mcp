/**
 * generate_rebuttal tool.
 * Given a set of reviewer comments, generates a structured rebuttal scaffold
 * following academic conventions: acknowledge, clarify, revise.
 */

import { z } from "zod";
import { logger } from "../shared/logger/index.js";
import type { HandlerResult } from "../shared/types.js";

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

// ── Types ──────────────────────────────────────────────────────────────────

interface ReviewerPoint {
  readonly reviewerId: string;
  readonly type: PointType;
  readonly text: string;
  readonly severity: "major" | "minor" | "curiosity";
}

type PointType = "concern" | "question" | "suggestion" | "praise" | "unclear";

// ── Parsing ────────────────────────────────────────────────────────────────

/**
 * Splits reviewer comments into individual response points.
 * Handles numbered lists, bullet points, and labeled reviewer blocks.
 */
function parseReviewerPoints(raw: string): ReadonlyArray<ReviewerPoint> {
  const points: ReviewerPoint[] = [];

  // Split by reviewer blocks if labeled
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

/** Splits text into labeled reviewer blocks if present. */
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

/** Splits a reviewer block into individual response items. */
function splitIntoItems(text: string): ReadonlyArray<string> {
  // Split on numbered items (1. 2. etc.), bullets, or double newlines
  const byNumbered = text.split(/\n(?=\d+[\.\)]\s)/);
  if (byNumbered.length > 1) return byNumbered;

  const byBullet = text.split(/\n(?=[-•*]\s)/);
  if (byBullet.length > 1) return byBullet;

  // Fall back: split on double newlines
  const byParagraph = text.split(/\n\n+/);
  return byParagraph.filter((p) => p.trim().length > 20);
}

/** Classifies the type of reviewer point based on language. */
function classifyPoint(text: string): PointType {
  const lower = text.toLowerCase();
  if (/\?/.test(text) || /\bwhy\b|\bwhat\b|\bhow\b|\bclarif/.test(lower)) return "question";
  if (/\bsuggest|\bwould benefit|\bcould be improved|\bshould|\brecommend/.test(lower)) return "suggestion";
  if (/\bexcellent|\bwell-written|\bstrong|\bimpressive|\bnovel|\bgood/.test(lower)) return "praise";
  if (/\bunclear|\bconfusing|\bhard to follow|\bvague|\bnot clear/.test(lower)) return "unclear";
  return "concern";
}

/** Estimates severity from keyword signals. */
function estimateSeverity(text: string): "major" | "minor" | "curiosity" {
  const lower = text.toLowerCase();
  if (/\bmajor|\bfundamental|\bsignificant concern|\bflaw|\binvalid|\bmissing crucial/.test(lower)) return "major";
  if (/\bminor|\btypograph|\bnit|\bwording|\bformat|\bsmall/.test(lower) || text.length < 80) return "minor";
  return "curiosity";
}

// ── Scaffold builder ────────────────────────────────────────────────────────

/** Builds the full rebuttal scaffold. */
function buildRebuttalScaffold(
  points: ReadonlyArray<ReviewerPoint>,
  args: GenerateRebuttalArgs
): string {
  const lines: string[] = [];

  lines.push("# Author Rebuttal");
  lines.push("");
  if (args.paper_title) lines.push(`**Paper:** ${args.paper_title}`);
  if (args.venue) lines.push(`**Venue:** ${args.venue}`);
  lines.push(`**Tone:** ${args.tone}`);
  lines.push(`**Points to address:** ${points.length}`);
  lines.push("");
  lines.push("─".repeat(70));
  lines.push("");
  lines.push(openingStatement(args.tone));
  lines.push("");

  // Group by reviewer
  const byReviewer = new Map<string, ReviewerPoint[]>();
  for (const point of points) {
    const list = byReviewer.get(point.reviewerId) ?? [];
    list.push(point);
    byReviewer.set(point.reviewerId, list);
  }

  // Sort: major concerns first within each reviewer
  for (const [reviewerId, reviewerPoints] of byReviewer) {
    const sorted = [...reviewerPoints].sort((a, b) => {
      const order = { major: 0, curiosity: 1, minor: 2 };
      return order[a.severity] - order[b.severity];
    });

    lines.push(`## Response to ${reviewerId}`);
    lines.push("");

    for (let i = 0; i < sorted.length; i++) {
      const point = sorted[i]!;
      lines.push(...renderResponseBlock(point, i + 1, args.tone));
      lines.push("");
    }
  }

  lines.push("─".repeat(70));
  lines.push("## Summary of Changes");
  lines.push("");
  lines.push("The following changes have been made to the manuscript in response to the reviews:");
  lines.push("");
  lines.push("<!-- List concrete changes made. Be specific about page/section numbers. -->");

  const majorCount = points.filter((p) => p.severity === "major").length;
  const minorCount = points.filter((p) => p.severity === "minor").length;

  for (let i = 0; i < majorCount; i++) {
    lines.push(`- [Major change ${i + 1}] *Describe what was changed and where.*`);
  }
  for (let i = 0; i < minorCount; i++) {
    lines.push(`- [Minor change ${i + 1}] *Describe what was changed.*`);
  }

  lines.push("");
  lines.push(`\`files_created\`: []`);
  lines.push(`\`next_steps\`: ["Fill in each response block above with paper-specific arguments.", "Use review_paper after revisions to verify the issues are resolved.", "Cross-check the Summary of Changes against actual manuscript edits."]`);

  return lines.join("\n");
}

/** Returns an opening statement appropriate to the tone. */
function openingStatement(tone: string): string {
  switch (tone) {
    case "formal":
      return "We thank the reviewers for their thorough and constructive evaluation of our manuscript. We have carefully addressed each comment below and believe the revised manuscript is substantially improved.";
    case "concise":
      return "We thank all reviewers for their comments. Responses follow.";
    case "collegial":
    default:
      return "We sincerely thank all reviewers for their time and thoughtful feedback. We have addressed each point in detail below. We believe the revision is substantially stronger as a result.";
  }
}

/** Renders a single response block for one reviewer point. */
function renderResponseBlock(
  point: ReviewerPoint,
  index: number,
  tone: string
): ReadonlyArray<string> {
  const severityLabel = point.severity === "major"
    ? " 🔴 **[Major]**"
    : point.severity === "minor"
    ? " 🟢 **[Minor]**"
    : "";

  const lines: string[] = [
    `### Point ${index}${severityLabel} — \`${point.type}\``,
    "",
    `> ${point.text.replace(/\n/g, "\n> ")}`,
    "",
    "**Response:**",
    "",
  ];

  lines.push(...responsePrompts(point.type, tone));

  if (point.type === "concern" || point.type === "unclear") {
    lines.push("**Manuscript change:** <!-- Specify section, page, or line numbers. -->");
  }

  return lines;
}

/** Returns contextual response prompts based on point type. */
function responsePrompts(type: PointType, tone: string): ReadonlyArray<string> {
  switch (type) {
    case "concern":
      return [
        "<!-- Acknowledge the concern, then refute or concede. -->",
        "<!-- If conceding: describe the specific revision made. -->",
        "<!-- If refuting: cite evidence from the paper or prior work. -->",
        "[Response text]",
        "",
      ];
    case "question":
      return [
        "<!-- Answer directly in 2-3 sentences. -->",
        "<!-- If the answer reveals a gap, acknowledge and describe the fix. -->",
        "[Response text]",
        "",
      ];
    case "suggestion":
      return [
        "<!-- Accept, partially accept, or decline with rationale. -->",
        "<!-- If accepted: describe the specific change made. -->",
        "[Response text]",
        "",
      ];
    case "unclear":
      return [
        "<!-- Acknowledge the confusion, clarify your intent, revise the passage. -->",
        "[Response text]",
        "",
      ];
    case "praise":
      return [
        tone === "concise" ? "" : "We thank the reviewer for this positive assessment.",
        "",
      ];
    default:
      return ["[Response text]", ""];
  }
}
