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
import { checkCitationsHandler } from "./check-citations.js";
import { detectPlagiarismHandler } from "./detect-plagiarism.js";
import { compressDraftHandler } from "./compress-draft.js";
import { MissingParameterError, ScholarisError } from "../shared/errors/index.js";
import { isPro, requirePro, freeVenues, freeProfiles } from "../shared/license/index.js";
import { logger } from "../shared/logger/index.js";

const MODULE = "tools/scholaris-router";

// ── Action enum ────────────────────────────────────────────────────────────

const ACTIONS = [
  "review_paper",
  "check_venue_fit",
  "diff_audit",
  "generate_rebuttal",
  "check_citations",
  "detect_plagiarism",
  "compress_draft",
] as const;

type Action = (typeof ACTIONS)[number];

// ── Unified schema ─────────────────────────────────────────────────────────

export const scholarisMcpSchema = z.object({
  action: z.enum(ACTIONS).describe(
    "Tool to invoke:\n" +
      "  review_paper        — Structured review protocol (logical, rhetorical, structural, style)\n" +
      "  check_venue_fit     — Compare paper readiness across multiple venues\n" +
      "  diff_audit          — Detect cascade effects after section revisions\n" +
      "  generate_rebuttal   — Build structured rebuttal scaffold from reviewer comments\n" +
      "  check_citations     — [Pro] Find papers that should cite you but don't\n" +
      "  detect_plagiarism   — [Pro] Detect plagiarism between a source paper and your prior work\n" +
      "  compress_draft      — Flag redundant, misplaced, or removable sections (Saint-Exupéry test)"
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
  focus_areas: z
    .array(z.string())
    .optional()
    .describe("Aspects to emphasise in review_paper, e.g. ['citation density', 'proof in §3']."),

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
    .describe("Paper title for rebuttal header or for check_citations (required there)."),
  rebuttal_venue: z
    .string()
    .optional()
    .describe("Venue name for rebuttal header (e.g. 'NeurIPS 2026')."),
  tone: z
    .enum(["formal", "collegial", "concise"])
    .optional()
    .describe("Rebuttal tone. Default: 'collegial'."),

  // ── check_citations (Pro) ──────────────────────────────────────────────────
  paper_authors: z
    .array(z.string())
    .optional()
    .describe("Author names for check_citations disambiguation."),
  claims: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "Specific claim phrases for check_citations (overrides auto-extraction). Max 5."
    ),
  published_after: z
    .string()
    .optional()
    .describe("ISO year (e.g. '2022') — only include papers published after this year in check_citations."),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max papers to return in check_citations. Default: 10."),

  // ── detect_plagiarism (Pro) ────────────────────────────────────────────────
  source_doi: z
    .string()
    .optional()
    .describe(
      "DOI of the paper being investigated (e.g. '10.64898/2026.02.25.708045'). " +
        "Provide this OR source_paper_text for detect_plagiarism."
    ),
  source_paper_text: z
    .string()
    .optional()
    .describe(
      "Full plain text of the paper under investigation. " +
        "Provide this OR source_doi for detect_plagiarism."
    ),
  reference_dois: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "DOIs of your reference (prior) papers. Provide these OR reference_paper_texts. Max 5."
    ),
  reference_paper_texts: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "Full plain texts of your reference (prior) papers. Provide these OR reference_dois. Max 5."
    ),
  similarity_threshold: z
    .number()
    .min(0.05)
    .max(0.9)
    .optional()
    .describe("Minimum Jaccard score to report a suspicious passage (default 0.20)."),

  // ── compress_draft (free) ──────────────────────────────────────────────────
  compression_mode: z
    .enum(["aggressive", "moderate", "light"])
    .optional()
    .describe(
      "Sensitivity of the compression audit for compress_draft. " +
        "'aggressive' flags more; 'light' flags only obvious redundancies. Default: 'moderate'."
    ),
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
    case "review_paper": {
      const requestedProfiles = args.profiles ?? ["logical", "structural"];
      let profilesToUse = requestedProfiles;
      let profileNote: string | null = null;

      if (!isPro()) {
        const free = freeProfiles();
        const blocked = requestedProfiles.filter((p) => !free.includes(p));
        profilesToUse = requestedProfiles.filter((p) => free.includes(p));
        if (profilesToUse.length === 0) profilesToUse = ["structural"];
        if (blocked.length > 0) {
          profileNote =
            `\n\n> **Note:** The **${blocked.join("** and **")}** profile(s) require Scholaris Pro. ` +
            `Set SCHOLARIS_LICENSE_KEY to unlock. → https://forgeworkshop.dev/scholaris`;
        }
      }

      const reviewResult = await reviewPaperHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "review_paper"),
        venue: args.venue ?? "general",
        profiles: profilesToUse,
        format: args.format ?? "actionable",
        section_focus: args.section_focus,
        focus_areas: args.focus_areas,
      });

      if (profileNote) reviewResult.content[0].text += profileNote;
      return reviewResult;
    }

    case "check_venue_fit": {
      type VenueEnum = "arxiv" | "ieee" | "acm" | "nature" | "neurips" | "icml";
      let venuesToUse: VenueEnum[] | undefined = args.venues;
      let venueNote: string | null = null;

      if (!isPro()) {
        const free = freeVenues();
        if (venuesToUse !== undefined) {
          const blocked = venuesToUse.filter((v) => !free.includes(v));
          const allowed = venuesToUse.filter((v) => free.includes(v));
          venuesToUse = allowed.length > 0 ? (allowed as VenueEnum[]) : undefined;
          if (blocked.length > 0) {
            venueNote =
              `\n\n> **Note:** The **${blocked.join("**, **")}** venue(s) require Scholaris Pro. ` +
              `Set SCHOLARIS_LICENSE_KEY to unlock. → https://forgeworkshop.dev/scholaris`;
          }
        } else {
          venuesToUse = free as VenueEnum[];
        }
      }

      const venueResult = await checkVenueFitHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "check_venue_fit"),
        venues: venuesToUse,
        show_gaps: args.show_gaps ?? true,
      });

      if (venueNote) venueResult.content[0].text += venueNote;
      return venueResult;
    }

    case "diff_audit":
      requirePro("diff_audit");
      return diffAuditHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "diff_audit"),
        changed_sections: requireParam(args.changed_sections, "changed_sections", "diff_audit"),
        show_claims: args.show_claims ?? false,
      });

    case "generate_rebuttal":
      requirePro("generate_rebuttal");
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

    case "check_citations":
      requirePro("check_citations");
      return checkCitationsHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "check_citations"),
        paper_title: requireParam(args.paper_title, "paper_title", "check_citations"),
        paper_authors: args.paper_authors,
        claims: args.claims,
        published_after: args.published_after,
        max_results: args.max_results ?? 10,
      });

    case "detect_plagiarism":
      requirePro("detect_plagiarism");
      return detectPlagiarismHandler({
        source_paper_text: args.source_paper_text,
        source_doi: args.source_doi,
        reference_paper_texts: args.reference_paper_texts,
        reference_dois: args.reference_dois,
        similarity_threshold: args.similarity_threshold ?? 0.20,
      });

    case "compress_draft":
      return compressDraftHandler({
        paper_text: requireParam(args.paper_text, "paper_text", "compress_draft"),
        mode: args.compression_mode ?? "moderate",
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
