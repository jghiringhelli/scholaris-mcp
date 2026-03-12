/**
 * Review framework renderer.
 * Composes venue profiles and review profiles into structured review protocols
 * that Claude uses to conduct consistent, reproducible paper reviews.
 */

import type { VenueProfile, ReviewProfile, ReviewProfileId, PaperSection } from "../shared/types.js";

const RULE_SEPARATORS = "─".repeat(70);

/**
 * Renders a complete review protocol from a venue profile and selected review profiles.
 *
 * @param venue - The target venue profile (or null for general review).
 * @param profiles - Selected review profiles to apply.
 * @param sections - Parsed paper sections (empty = do not scope per-section).
 * @param format - "full" | "actionable" | "summary".
 * @returns Rendered review protocol as a markdown string.
 */
export function renderReviewProtocol(
  venue: VenueProfile | null,
  profiles: ReadonlyArray<ReviewProfile>,
  sections: ReadonlyArray<PaperSection>,
  format: "full" | "actionable" | "summary"
): string {
  const parts: string[] = [];

  parts.push(renderHeader(venue, profiles));
  if (venue) parts.push(renderVenueSection(venue, format));
  parts.push(renderProfileSections(profiles, sections, format));
  parts.push(renderSynthesisPrompt(venue, profiles));
  parts.push(renderReportTemplate(format));

  return parts.join("\n\n");
}

/**
 * Renders the header block identifying the review scope.
 */
function renderHeader(venue: VenueProfile | null, profiles: ReadonlyArray<ReviewProfile>): string {
  const venueName = venue ? venue.name : "General Academic Review";
  const profileNames = profiles.map((p) => p.name).join(", ");
  return [
    "# Scholaris Review Protocol",
    "",
    `**Target venue:** ${venueName}`,
    `**Review dimensions:** ${profileNames || "none selected"}`,
    `**Generated:** ${new Date().toISOString().split("T")[0]}`,
    "",
    RULE_SEPARATORS,
  ].join("\n");
}

/**
 * Renders venue-specific requirements and rejection patterns.
 */
function renderVenueSection(venue: VenueProfile, format: "full" | "actionable" | "summary"): string {
  const fmt = venue.formatting;
  const fmtParts: string[] = [];
  if (fmt.citation ?? fmt.citation_style) fmtParts.push(`${fmt.citation ?? fmt.citation_style} citations`);
  const pageLimit = fmt.page_limit ?? fmt.max_pages;
  if (pageLimit) fmtParts.push(`max ${pageLimit} pages`);
  if (fmt.double_blind) fmtParts.push("double-blind");

  const requiredSections = venue.sections?.required ?? [];
  const lines: string[] = [
    `## Venue Requirements — ${venue.name}`,
    "",
    `**Category:** ${venue.category}`,
    `**Required sections:** ${requiredSections.join(", ")}`,
    fmtParts.length > 0 ? `**Formatting:** ${fmtParts.join(" · ")}` : "",
    "",
    "### Submission Criteria",
  ].filter((l) => l !== "");

  for (const criterion of venue.criteria) {
    const badge = severityBadge(criterion.severity);
    lines.push(`${badge} **${criterion.id}** — ${criterion.description}`);
    if (format === "full") {
      lines.push(`   *Applies to:* ${criterion.check_in.join(", ")}`);
    }
  }

  if (venue.rejection_patterns.length > 0) {
    lines.push("", "### Common Rejection Patterns");
    for (const pattern of venue.rejection_patterns) {
      lines.push(`- ${pattern}`);
    }
  }

  if (venue.submission_notes) {
    lines.push("", `**Submission notes:** ${venue.submission_notes}`);
  }

  return lines.join("\n");
}

/**
 * Renders the review checklist for each selected profile.
 */
function renderProfileSections(
  profiles: ReadonlyArray<ReviewProfile>,
  sections: ReadonlyArray<PaperSection>,
  format: "full" | "actionable" | "summary"
): string {
  const parts: string[] = [];

  for (const profile of profiles) {
    parts.push(`## ${profile.name}`);
    parts.push("");
    parts.push(`> ${profile.description}`);
    parts.push("");

    for (const dimension of profile.dimensions) {
      parts.push(`### ${dimension.title}`);
      parts.push("");
      if (format !== "summary") {
        parts.push(dimension.description);
        parts.push("");
      }

      parts.push("**Prompts to evaluate:**");
      for (const prompt of dimension.prompts) {
        parts.push(`- ${prompt}`);
      }

      if (format === "full") {
        parts.push("");
        parts.push("**Severity guide:**");
        parts.push(`- 🔴 **Critical:** ${dimension.severity_guide.critical}`);
        parts.push(`- 🟠 **High:** ${dimension.severity_guide.high}`);
        parts.push(`- 🟡 **Medium:** ${dimension.severity_guide.medium}`);
      }

      if (sections.length > 0 && profile.report_format.per_section) {
        parts.push("");
        parts.push("**Section scope:** " + sections.map((s) => s.title).join(" · "));
      }

      parts.push("");
    }
  }

  return parts.join("\n");
}

/**
 * Renders the final synthesis prompt Claude should follow after completing all checks.
 */
function renderSynthesisPrompt(
  venue: VenueProfile | null,
  profiles: ReadonlyArray<ReviewProfile>
): string {
  const lines: string[] = [
    RULE_SEPARATORS,
    "## Synthesis Instructions",
    "",
    "After completing all dimension checks above:",
    "",
    "1. **Rank findings by severity** — critical issues first, then high, medium, low.",
    "2. **Identify cascades** — note where fixing one issue may resolve or create others.",
    "3. **Check internal consistency** — claims made in §Introduction must hold through §Conclusion.",
    "4. **Assess revision scope** — estimate: minor revision / major revision / fundamental restructure.",
  ];

  if (venue) {
    lines.push(`5. **Venue fitness** — state a confidence score (0-10) for acceptance at ${venue.name}.`);
    lines.push("   Justify the score against the submission criteria above.");
  }

  const includesRemediation = profiles.some((p) => p.report_format.remediation);
  if (includesRemediation) {
    lines.push("", "For each finding, provide a concrete **remediation action** the author can take.");
  }

  return lines.join("\n");
}

/**
 * Renders the blank report template for Claude to fill.
 */
function renderReportTemplate(format: "full" | "actionable" | "summary"): string {
  if (format === "summary") {
    return [
      RULE_SEPARATORS,
      "## Report (Summary Format)",
      "",
      "**Overall assessment:** [1-2 sentences]",
      "",
      "**Critical issues:** [bullet list or 'None']",
      "",
      "**Recommended action:** minor revision | major revision | fundamental restructure | reject",
    ].join("\n");
  }

  return [
    RULE_SEPARATORS,
    "## Report",
    "",
    "### Critical Issues",
    "<!-- One finding per bullet. Format: [Section] — [Issue] — [Remediation] -->",
    "",
    "### High-Severity Issues",
    "",
    "### Medium / Low Issues",
    "",
    "### Strengths",
    "<!-- What the paper does well. Minimum 2 items. -->",
    "",
    "### Overall Assessment",
    "- **Revision scope:** [minor | major | fundamental | reject]",
    ...(format === "full"
      ? ["- **Venue fitness (0-10):** [score] — [rationale]"]
      : []),
    "- **Key action for author:** [single most important next step]",
  ].join("\n");
}

/** Returns an emoji badge for the given severity level. */
function severityBadge(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🟢";
    default: return "⚪";
  }
}

/**
 * Renders a venue fitness comparison table for multiple venues.
 *
 * @param venues - Venue profiles to compare.
 * @param matchedCriteria - Map of venueId → number of criteria the paper meets.
 * @param totalCriteria - Map of venueId → total criteria count.
 * @returns Markdown table string.
 */
export function renderVenueFitTable(
  venues: ReadonlyArray<VenueProfile>,
  matchedCriteria: ReadonlyMap<string, number>,
  totalCriteria: ReadonlyMap<string, number>
): string {
  const lines: string[] = [
    "| Venue | Category | Page limit | Criteria met | Fit score |",
    "|-------|----------|-----------|--------------|-----------|",
  ];

  for (const venue of venues) {
    const matched = matchedCriteria.get(venue.id) ?? 0;
    const total = totalCriteria.get(venue.id) ?? 1;
    const score = Math.round((matched / total) * 10);
    const bar = "█".repeat(score) + "░".repeat(10 - score);
    const pageLimit = venue.formatting.page_limit ?? venue.formatting.max_pages;
    const pageLimitStr = pageLimit ? `${pageLimit}p` : "none";
    lines.push(`| ${venue.name} | ${venue.category} | ${pageLimitStr} | ${matched}/${total} | ${bar} ${score}/10 |`);
  }

  return lines.join("\n");
}
