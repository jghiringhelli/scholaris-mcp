/**
 * diff_audit tool.
 * Given the current paper text and a list of changed sections,
 * computes which other sections need re-auditing due to claim cascade effects.
 *
 * Uses two complementary signals:
 *   1. Explicit cross-references detected by claim-extractor (certain cascade)
 *   2. TF-IDF semantic coupling from semantic-section-graph (probabilistic cascade)
 *
 * This solves the "change in §Introduction triggers new faults in §Discussion" problem
 * by building a combined dependency graph and propagating change impact.
 */

import { z } from "zod";
import { parseSections } from "../analyzers/section-parser.js";
import { buildPaperDependencies } from "../analyzers/claim-extractor.js";
import {
  buildSemanticSectionGraph,
  findCascade,
  couplingLabel,
  STRONG_COUPLING_THRESHOLD,
} from "../analyzers/semantic-section-graph.js";
import { logger } from "../shared/logger/index.js";
import type { HandlerResult } from "../shared/types.js";

const MODULE = "tools/diff-audit";

export const diffAuditSchema = z.object({
  paper_text: z
    .string()
    .min(100)
    .describe("The current (post-revision) full paper text."),
  changed_sections: z
    .array(z.string())
    .min(1)
    .describe(
      "List of section titles or heading text that were modified. " +
        "E.g. ['Introduction', 'Related Work']. Case-insensitive matching."
    ),
  show_claims: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, also list the specific claims in affected sections that reference changed content."
    ),
});

export type DiffAuditArgs = z.infer<typeof diffAuditSchema>;

/**
 * Handles the diff_audit action.
 * Builds the paper's section dependency graph and returns a targeted re-audit plan.
 *
 * @param args - Validated input arguments.
 * @returns MCP content item with affected sections and re-audit instructions.
 */
export async function diffAuditHandler(args: DiffAuditArgs): Promise<HandlerResult> {
  logger.info(MODULE, "Diff audit starting", {
    changedSections: args.changed_sections,
    textLength: args.paper_text.length,
    showClaims: args.show_claims,
  });

  const sections = parseSections(args.paper_text);
  const paper = buildPaperDependencies(sections);

  // Match changed_sections (user-provided titles) to section IDs
  const changedIds = args.changed_sections
    .map((title) => {
      const match = sections.find((s) =>
        s.title.toLowerCase().includes(title.toLowerCase())
      );
      return match?.id ?? null;
    })
    .filter((id): id is string => id !== null);

  const unmatched = args.changed_sections.filter((title) =>
    !sections.some((s) => s.title.toLowerCase().includes(title.toLowerCase()))
  );

  // ── Build semantic graph alongside explicit dependency graph ──────────────
  const semanticGraph = buildSemanticSectionGraph(sections, paper.dependencies);
  const cascadeMap = findCascade(changedIds, semanticGraph);

  // Combine explicit claim-extractor results with semantic cascade
  // (claim-extractor's findAffectedSections is now superseded by findCascade,
  //  which already incorporates explicit deps via the graph builder)
  const affectedIds = new Set(cascadeMap.keys());
  const affectedSections = sections.filter((s) => affectedIds.has(s.id));

  // Sort: explicit-ref sections first, then by max similarity descending
  affectedSections.sort((a, b) => {
    const ea = cascadeMap.get(a.id)!;
    const eb = cascadeMap.get(b.id)!;
    if (ea.hasExplicitRef && !eb.hasExplicitRef) return -1;
    if (eb.hasExplicitRef && !ea.hasExplicitRef) return 1;
    return eb.maxSimilarity - ea.maxSimilarity;
  });

  // Build re-audit instructions per affected section
  const reauditBlocks: string[] = [];
  for (const section of affectedSections) {
    const entry = cascadeMap.get(section.id)!;
    const claimsInSection = paper.claims.filter(
      (c) => c.sectionId === section.id && c.references.some((r) => changedIds.includes(r))
    );

    const simPct = Math.round(entry.maxSimilarity * 100);
    const label = couplingLabel(entry.maxSimilarity, entry.hasExplicitRef ? "explicit" : "semantic");
    const strongFlag = entry.maxSimilarity >= STRONG_COUPLING_THRESHOLD ? " ⚠️ **strong coupling**" : "";

    reauditBlocks.push(`### Re-audit: ${section.title}`);
    reauditBlocks.push("");
    reauditBlocks.push(
      `**Why affected:** ${label} (similarity ${simPct}%)${strongFlag}`
    );

    if (args.show_claims && claimsInSection.length > 0) {
      reauditBlocks.push("");
      reauditBlocks.push("**Specific claims to verify:**");
      for (const claim of claimsInSection.slice(0, 5)) {
        reauditBlocks.push(`- *[${claim.type}]* ${truncate(claim.text, 120)}`);
      }
      if (claimsInSection.length > 5) {
        reauditBlocks.push(`  *(${claimsInSection.length - 5} more claims — rerun with show_claims=true)*`);
      }
    }

    reauditBlocks.push("");
    reauditBlocks.push("**Prompts for re-audit:**");
    reauditBlocks.push(`- Do any forward/backward references to the changed sections still hold?`);
    reauditBlocks.push(`- Are quantitative claims consistent with new experimental results?`);
    reauditBlocks.push(`- Does the narrative flow remain coherent with the revised content?`);
    reauditBlocks.push("");
  }

  // Summary
  const changedTitles = changedIds
    .map((id) => sections.find((s) => s.id === id)?.title ?? id)
    .join(", ");

  const explicitCount = [...cascadeMap.values()].filter((e) => e.hasExplicitRef).length;
  const semanticOnlyCount = affectedSections.length - explicitCount;

  const lines: string[] = [
    "# Diff Audit — Cascade Impact Report",
    "",
    `**Changed sections:** ${changedTitles || "(none matched)"}`,
    `**Sections requiring re-audit:** ${affectedSections.length}` +
      (explicitCount > 0 ? ` (${explicitCount} explicit, ${semanticOnlyCount} semantic)` : ""),
    "",
  ];

  if (unmatched.length > 0) {
    lines.push(
      `> ⚠️ **Unmatched section names:** ${unmatched.join(", ")}`,
      `> Available sections: ${sections.map((s) => s.title).join(", ")}`,
      ""
    );
  }

  if (affectedSections.length === 0) {
    lines.push(
      "✅ **No cascade effects detected.**",
      "",
      "The changed sections appear to be self-contained — no other sections were found",
      "to directly reference or share significant vocabulary with their claims.",
      "Manual review of the abstract and conclusion is still recommended."
    );
  } else {
    lines.push(
      "The following sections contain claims or references that may be inconsistent",
      "with the changes made. Re-audit each in the order listed (highest priority first).",
      "",
      "─".repeat(70),
      "",
      ...reauditBlocks
    );
  }

  lines.push(
    "─".repeat(70),
    `\`files_created\`: []`,
    `\`next_steps\`: [${
      affectedSections.length > 0
        ? `"Re-audit the ${affectedSections.length} affected section(s) using review_paper with section_focus.", `
        : ""
    }"Run check_venue_fit after all revisions are complete."]`
  );

  logger.info(MODULE, "Diff audit complete", {
    changedCount: changedIds.length,
    affectedCount: affectedSections.length,
    explicitCount,
    semanticOnlyCount,
  });

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

/** Truncates text to maxLength, adding ellipsis if needed. */
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
}
