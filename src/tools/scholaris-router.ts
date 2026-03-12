/**
 * Scholaris MCP unified tool router.
 * One tool, one `action` parameter, dispatches to all handlers.
 * Zod schema is the source of truth for all inputs.
 */

import { z } from "zod";
import { reviewPaperHandler } from "./review-paper.js";
import { checkVenueFitHandler } from "./check-venue-fit.js";
import { diffAuditHandler } from "./diff-audit.js";
import { generateRebuttalHandler } from "./generate-rebuttal.js";
import { MissingParameterError, ScholarisError } from "../shared/errors/index.js";
import { logger } from "../shared/logger/index.js";

const MODULE = "tools/scholaris-router";

// ── Action enum ────────────────────────────────────────────────────────────

const ACTIONS = [
  "review_paper",
  "check_venue_fit",
  "diff_audit",
  "generate_rebuttal",
] as const;

type Action = (typeof ACTIONS)[number];

// ── Unified schema ─────────────────────────────────────────────────────────

export const scholarisMcpSchema = z.object({
  action: z.enum(ACTIONS).describe(
    "Tool to invoke:\n" +
      "  review_paper        — Structured review protocol (logical, rhetorical, structural, style)\n" +
      "  check_venue_fit     — Compare paper readiness across multiple venues\n" +
      "  diff_audit          — Detect cascade effects after section revisions\n" +
      "  generate_rebuttal   — Build structured rebuttal scaffold from reviewer comments"
  ),

  // ── review_paper + check_venue_fit + diff_audit ──────────────────────────
  paper_text: z
    .string()
    .optional()
    .describe("Full paper text. Required for: review_paper, check_venue_fit, diff_audit."),

  // ── review_paper ─────────────────────────────────────────────────────────
  venue: z
    .enum(["arxiv", "ieee", "acm", "nature", "neurips", "icml", "general"])
    .optional()
    .describe("Target venue for review_paper and check_venue_fit."),
  profiles: z
    .array(z.enum(["logical", "rhetorical", "structural", "style"]))
    .optional()
    .describe("Review profiles for review_paper. Default: ['logical', 'structural']."),
  format: z
    .enum(["full", "actionable", "summary"])
    .optional()
    .describe("Report detail for review_paper. Default: 'actionable'."),
  section_focus: z
    .string()
    .optional()
    .describe("Scope review_paper to a specific section heading."),

  // ── check_venue_fit ───────────────────────────────────────────────────────
  venues: z
    .array(z.enum(["arxiv", "ieee", "acm", "nature", "neurips", "icml"]))
    .optional()
    .describe("Specific venues for check_venue_fit. Omit for all venues."),
  show_gaps: z
    .boolean()
    .optional()
    .describe("Include gap analysis in check_venue_fit. Default: true."),

  // ── diff_audit ────────────────────────────────────────────────────────────
  changed_sections: z
    .array(z.string())
    .optional()
    .describe("Section titles modified. Required for diff_audit."),
  show_claims: z
    .boolean()
    .optional()
    .describe("Show specific affected claims in diff_audit. Default: false."),

  // ── generate_rebuttal ─────────────────────────────────────────────────────
  reviewer_comments: z
    .string()
    .optional()
    .describe("Raw reviewer comments. Required for generate_rebuttal."),
  paper_title: z
    .string()
    .optional()
    .describe("Paper title for rebuttal header."),
  rebuttal_venue: z
    .string()
    .optional()
    .describe("Venue name for rebuttal header (e.g. 'NeurIPS 2026')."),
  tone: z
    .enum(["formal", "collegial", "concise"])
    .optional()
    .describe("Rebuttal tone. Default: 'collegial'."),
});

export type ScholarisInput = z.infer<typeof scholarisMcpSchema>;

// ── Dispatch ───────────────────────────────────────────────────────────────

/**
 * Main dispatch function — routes validated input to the appropriate handler.
 *
 * @param input - Raw (unvalidated) input object from the MCP caller.
 * @returns Handler result with content items.
 */
export async function dispatch(input: unknown) {
  const parsed = scholarisMcpSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new ScholarisError(`Invalid input: ${message}`, { errors: parsed.error.errors });
  }

  const args = parsed.data;
  logger.info(MODULE, "Dispatching action", { action: args.action });

  switch (args.action as Action) {
    case "review_paper":
      return reviewPaperHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "review_paper"),
        venue: args.venue ?? "general",
        profiles: args.profiles ?? ["logical", "structural"],
        format: args.format ?? "actionable",
        section_focus: args.section_focus,
      });

    case "check_venue_fit":
      return checkVenueFitHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "check_venue_fit"),
        venues: args.venues,
        show_gaps: args.show_gaps ?? true,
      });

    case "diff_audit":
      return diffAuditHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "diff_audit"),
        changed_sections: requireParam(args.changed_sections, "changed_sections", "diff_audit"),
        show_claims: args.show_claims ?? false,
      });

    case "generate_rebuttal":
      return generateRebuttalHandler({
        reviewer_comments: requireParam(
          args.reviewer_comments,
          "reviewer_comments",
          "generate_rebuttal"
        ),
        paper_title: args.paper_title,
        venue: args.rebuttal_venue,
        tone: args.tone ?? "collegial",
      });
  }
}

/** Throws MissingParameterError if value is undefined. */
function requireParam<T>(value: T | undefined, name: string, tool: string): T {
  if (value === undefined || value === null) {
    throw new MissingParameterError(name, tool);
  }
  return value;
}
