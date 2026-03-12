/**
 * review_paper tool.
 * Constructs a structured review protocol and returns it along with
 * a parsed section map, ready for Claude to apply to the paper text.
 */

import { z } from "zod";
import { getVenueProfile, getReviewProfile } from "../registry/loader.js";
import { renderReviewProtocol } from "../registry/renderer.js";
import { parseSections } from "../analyzers/section-parser.js";
import { ScholarisError } from "../shared/errors/index.js";
import { logger } from "../shared/logger/index.js";
import type { HandlerResult, ReviewProfileId, VenueId } from "../shared/types.js";

const MODULE = "tools/review-paper";

export const reviewPaperSchema = z.object({
  paper_text: z
    .string()
    .min(100, "paper_text must be at least 100 characters")
    .describe("Full paper text (markdown or plain text). Minimum 100 characters."),
  venue: z
    .enum(["arxiv", "ieee", "acm", "nature", "neurips", "icml", "general"])
    .optional()
    .default("general")
    .describe("Target publication venue. Defaults to 'general'."),
  profiles: z
    .array(z.enum(["logical", "rhetorical", "structural", "style"]))
    .optional()
    .default(["logical", "structural"])
    .describe("Review dimensions to apply. Defaults to logical + structural."),
  format: z
    .enum(["full", "actionable", "summary"])
    .optional()
    .default("actionable")
    .describe(
      "Report detail level: 'full' includes severity guides; 'actionable' is default; 'summary' is brief."
    ),
  section_focus: z
    .string()
    .optional()
    .describe("Scope review to a specific section heading, e.g. 'Introduction'."),
});

export type ReviewPaperArgs = z.infer<typeof reviewPaperSchema>;

/**
 * Handles the review_paper action.
 * Parses the paper, loads venue + profile templates, and renders a review protocol.
 *
 * @param args - Validated input arguments.
 * @returns MCP content item containing the rendered review protocol.
 */
export async function reviewPaperHandler(args: ReviewPaperArgs): Promise<HandlerResult> {
  logger.info(MODULE, "Review paper starting", {
    venue: args.venue,
    profiles: args.profiles,
    format: args.format,
    section_focus: args.section_focus,
    textLength: args.paper_text.length,
  });

  // Parse sections
  const allSections = parseSections(args.paper_text);
  const sections =
    args.section_focus
      ? allSections.filter((s) =>
          s.title.toLowerCase().includes(args.section_focus!.toLowerCase())
        )
      : allSections;

  // Load venue (null for "general" — no venue-specific rules)
  const venueProfile =
    args.venue !== "general"
      ? safeGetVenue(args.venue as VenueId)
      : null;

  // Load review profiles
  const reviewProfiles = args.profiles
    .map((id) => safeGetProfile(id as ReviewProfileId))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const protocol = renderReviewProtocol(
    venueProfile,
    reviewProfiles,
    sections,
    args.format
  );

  // Append section map for orientation
  const sectionMap = sections
    .map((s, i) => `  ${i + 1}. ${s.title} (${s.content.length} chars)`)
    .join("\n");

  const output = [
    protocol,
    "",
    "─".repeat(70),
    "## Paper Section Map (for reference)",
    "",
    "Apply each review dimension to the sections listed above.",
    sections.length === 0 ? "(No sections detected — reviewing as single block)" : sectionMap,
    "",
    `\`files_created\`: []`,
    `\`next_steps\`: ["Apply the protocol above to the paper text.", "Use diff_audit after revisions to detect cascade effects.", "Use check_venue_fit to compare readiness across multiple venues."]`,
  ].join("\n");

  logger.info(MODULE, "Review protocol rendered", {
    sectionCount: sections.length,
    profileCount: reviewProfiles.length,
  });

  return { content: [{ type: "text", text: output }] };
}

function safeGetVenue(id: VenueId) {
  try {
    return getVenueProfile(id);
  } catch (err) {
    logger.warn(MODULE, "Venue profile not found; continuing without venue rules", { id });
    return null;
  }
}

function safeGetProfile(id: ReviewProfileId) {
  try {
    return getReviewProfile(id);
  } catch (err) {
    logger.warn(MODULE, "Review profile not found; skipping", { id });
    return null;
  }
}
