/**
 * Rebuttal scaffold builder and renderer.
 * Responsible for assembling the full markdown rebuttal document from parsed reviewer points.
 */

import type { GenerateRebuttalArgs } from "./generate-rebuttal.js";

export interface ReviewerPoint {
  readonly reviewerId: string;
  readonly type: PointType;
  readonly text: string;
  readonly severity: "major" | "minor" | "curiosity";
}

export type PointType = "concern" | "question" | "suggestion" | "praise" | "unclear";

/**
 * Builds the full rebuttal scaffold from parsed points and input arguments.
 *
 * @param points - Parsed reviewer points.
 * @param args - Validated handler arguments (title, venue, tone).
 * @returns The complete rebuttal document as a markdown string.
 */
export function buildRebuttalScaffold(
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

  const byReviewer = new Map<string, ReviewerPoint[]>();
  for (const point of points) {
    const list = byReviewer.get(point.reviewerId) ?? [];
    list.push(point);
    byReviewer.set(point.reviewerId, list);
  }

  for (const [reviewerId, reviewerPoints] of byReviewer) {
    const sorted = [...reviewerPoints].sort((a, b) => {
      const order = { major: 0, curiosity: 1, minor: 2 };
      return order[a.severity] - order[b.severity];
    });

    lines.push(`## Response to ${reviewerId}`);
    lines.push("");

    for (let i = 0; i < sorted.length; i++) {
      lines.push(...renderResponseBlock(sorted[i]!, i + 1, args.tone));
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

/**
 * Returns an opening statement appropriate to the requested tone.
 *
 * @param tone - One of "formal" | "collegial" | "concise".
 * @returns The opening paragraph string.
 */
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

/**
 * Renders a single response block for one reviewer point.
 *
 * @param point - The reviewer point to render.
 * @param index - Display index (1-based) within the reviewer's section.
 * @param tone - Rebuttal tone, passed through to inline prompts.
 * @returns Array of markdown lines for this response block.
 */
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

/**
 * Returns contextual fill-in prompts based on reviewer point type.
 *
 * @param type - Classified point type.
 * @param tone - Rebuttal tone (used for "praise" brevity).
 * @returns Array of comment/placeholder lines.
 */
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
