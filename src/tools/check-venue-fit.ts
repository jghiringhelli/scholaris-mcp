/**
 * check_venue_fit tool.
 * Assesses paper readiness for multiple publication venues simultaneously,
 * returning a comparison table with fit scores and gap analysis.
 */

import { z } from "zod";
import { loadVenueProfiles } from "../registry/loader.js";
import { renderVenueFitTable } from "../registry/renderer.js";
import { parseSections } from "../analyzers/section-parser.js";
import { logger } from "../shared/logger/index.js";
import type { HandlerResult, VenueProfile } from "../shared/types.js";

const MODULE = "tools/check-venue-fit";

export const checkVenueFitSchema = z.object({
  paper_text: z
    .string()
    .min(100)
    .describe("Full paper text to assess."),
  venues: z
    .array(z.enum(["arxiv", "ieee", "acm", "nature", "neurips", "icml"]))
    .optional()
    .describe("Specific venues to check. Omit to compare all available venues."),
  show_gaps: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include per-venue gap analysis (missing criteria). Default true."),
});

export type CheckVenueFitArgs = z.infer<typeof checkVenueFitSchema>;

/**
 * Handles the check_venue_fit action.
 * Performs a structural criteria check for each venue (section presence,
 * formatting compliance) and returns a ranked fit table with gap details.
 *
 * @param args - Validated input arguments.
 * @returns MCP content item containing the venue comparison.
 */
export async function checkVenueFitHandler(args: CheckVenueFitArgs): Promise<HandlerResult> {
  logger.info(MODULE, "Venue fit check starting", {
    venues: args.venues,
    textLength: args.paper_text.length,
  });

  const allVenueProfiles = loadVenueProfiles();
  const sections = parseSections(args.paper_text);
  const sectionTitles = sections.map((s) => s.title.toLowerCase());

  // Select which venues to check
  const venueList: VenueProfile[] = args.venues
    ? args.venues.map((id) => allVenueProfiles.get(id)).filter((v): v is VenueProfile => v !== null && v !== undefined)
    : [...allVenueProfiles.values()];

  if (venueList.length === 0) {
    return {
      content: [{
        type: "text",
        text: "No venue profiles loaded. Ensure templates/venues/ contains YAML files.",
      }],
    };
  }

  const matchedCriteria = new Map<string, number>();
  const totalCriteria = new Map<string, number>();
  const gapBlocks: string[] = [];

  for (const venue of venueList) {
    const gaps: string[] = [];
    let matched = 0;

    // Check required sections
    for (const required of (venue.sections?.required ?? [])) {
      const found = sectionTitles.some((t) => t.includes(required.toLowerCase()));
      if (found) {
        matched++;
      } else {
        gaps.push(`Missing required section: **${required}**`);
      }
    }

    // Check criteria by section presence heuristic
    for (const criterion of venue.criteria) {
      if (criterion.severity === "critical" || criterion.severity === "high") {
        // Heuristic: paper "meets" a criterion if its check_in sections are present
        const sectionsPresent = criterion.check_in.every((s) =>
          s === "any" || sectionTitles.some((t) => t.includes(s.toLowerCase()))
        );
        if (sectionsPresent) {
          matched++;
        } else {
          gaps.push(`${severityBadge(criterion.severity)} **${criterion.id}** criterion: ${criterion.description}`);
        }
      }
    }

    const total = (venue.sections?.required ?? []).length +
      venue.criteria.filter((c) => c.severity === "critical" || c.severity === "high").length;

    matchedCriteria.set(venue.id, matched);
    totalCriteria.set(venue.id, total || 1);

    if (args.show_gaps && gaps.length > 0) {
      gapBlocks.push(
        `### Gaps — ${venue.name}`,
        ...gaps.map((g) => `- ${g}`),
        ""
      );
    }
  }

  // Sort venues by fit score descending
  const sortedVenues = [...venueList].sort((a, b) => {
    const scoreA = (matchedCriteria.get(a.id) ?? 0) / (totalCriteria.get(a.id) ?? 1);
    const scoreB = (matchedCriteria.get(b.id) ?? 0) / (totalCriteria.get(b.id) ?? 1);
    return scoreB - scoreA;
  });

  const table = renderVenueFitTable(sortedVenues, matchedCriteria, totalCriteria);
  const bestFit = sortedVenues[0];

  const output = [
    "# Venue Fit Assessment",
    "",
    `**Paper sections detected:** ${sections.map((s) => s.title).join(", ") || "none (unsectioned text)"}`,
    "",
    "## Fit Comparison",
    "",
    table,
    "",
    `**Best structural fit:** ${bestFit?.name ?? "n/a"}`,
    ...(args.show_gaps && gapBlocks.length > 0
      ? ["", "## Gap Analysis", "", ...gapBlocks]
      : []),
    "",
    "─".repeat(70),
    "> **Note:** Fit scores are based on structural criteria only (section presence,",
    "> formatting rules). Content quality, novelty, and significance require human review.",
    "> Use `review_paper` with the top venue for a full content-aware review.",
    "",
    `\`files_created\`: []`,
    `\`next_steps\`: ["Run review_paper targeting '${bestFit?.id ?? "general"}' for a full content review.", "Address gaps above before submission."]`,
  ].join("\n");

  logger.info(MODULE, "Venue fit check complete", { venueCount: venueList.length });

  return { content: [{ type: "text", text: output }] };
}

function severityBadge(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "high": return "🟠";
    default: return "🟡";
  }
}
