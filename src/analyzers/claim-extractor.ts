/**
 * Claim extractor.
 * Identifies key claims in paper sections and maps inter-section dependencies.
 * Used by diff_audit to determine which sections need re-auditing after a change.
 */

import type { Claim, PaperSection, ParsedPaper } from "../shared/types.js";

// ── Pattern sets ───────────────────────────────────────────────────────────

/** Sentences containing numbers with units or percentages — quantitative claims. */
const QUANTITATIVE_PATTERN =
  /(?:outperform|achiev|obtain|improv|reduc|increas|decreas|reach|show)\w*[^.]*?\b(\d+(?:\.\d+)?)\s*(?:%|percent|pp|x|×|times|fold|ms|seconds?|hours?|GB|KB)/gi;

/** Hedged directional claims: "we show", "this demonstrates", "we argue". */
const DIRECTIONAL_PATTERN =
  /\b(?:we (?:show|demonstrate|prove|argue|claim|propose|present)|this (?:shows|demonstrates|proves|argues)|results (?:show|demonstrate|confirm|indicate))\b/gi;

/** Definitional claims: "we define X as", "X is defined as". */
const DEFINITIONAL_PATTERN =
  /\b(?:we define|is defined as|refers? to|denote[sd]? by|formally,)\b/gi;

/** Forward references: "as shown in Section X", "see §X", "discussed below". */
const FORWARD_REF_PATTERN =
  /\b(?:(?:in|see|described in) (?:Section|§|Appendix)\s*\d[\d.]*|as (?:shown|discussed|described) (?:below|later|in (?:Section|§)))/gi;

/** Backward references: "as discussed in Section X", "see §X above". */
const BACKWARD_REF_PATTERN =
  /\b(?:(?:as (?:shown|discussed|described|introduced|presented|mentioned) (?:in|above)|in (?:Section|§))\s*\d[\d.]*|(?:Section|§)\s*\d[\d.]*\s+(?:showed?|described?|introduced?|presented?))/gi;

/** Section reference extractor: pulls "Section 3", "§4.2", etc. */
const SECTION_REF_EXTRACTOR = /(?:Section|§)\s*(\d[\d.]*)/gi;

// ── Extraction functions ───────────────────────────────────────────────────

/**
 * Builds a slug-like section ID from a reference number for cross-referencing.
 * Maps "Section 3" → look up the section by order.
 *
 * @param refNumber - The referenced section number string (e.g. "3", "4.2").
 * @param sections - All parsed sections.
 * @returns Matching section ID, or null if not found.
 */
function resolveSectionRef(
  refNumber: string,
  sections: ReadonlyArray<PaperSection>
): string | null {
  // Try to find by matching numbered prefix or sequential index
  const index = parseInt(refNumber.split(".")[0]!) - 1;
  if (index >= 0 && index < sections.length) {
    return sections[index]!.id;
  }
  return null;
}

/**
 * Extracts all cross-section references from a block of text.
 *
 * @param text - Text to scan.
 * @param sections - All parsed sections (for reference resolution).
 * @returns Array of referenced section IDs.
 */
function extractSectionReferences(
  text: string,
  sections: ReadonlyArray<PaperSection>
): ReadonlyArray<string> {
  const refs = new Set<string>();
  let match: RegExpExecArray | null;
  const re = /(?:Section|§)\s*(\d[\d.]*)/gi;

  while ((match = re.exec(text)) !== null) {
    const resolved = resolveSectionRef(match[1]!, sections);
    if (resolved) refs.add(resolved);
  }

  return [...refs];
}

/**
 * Extracts claims from a single paper section.
 *
 * @param section - The section to analyze.
 * @param allSections - All sections (for cross-reference resolution).
 * @returns Array of claims found in the section.
 */
export function extractClaimsFromSection(
  section: PaperSection,
  allSections: ReadonlyArray<PaperSection>
): ReadonlyArray<Claim> {
  const claims: Claim[] = [];
  const text = section.content;

  if (QUANTITATIVE_PATTERN.test(text)) {
    QUANTITATIVE_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = QUANTITATIVE_PATTERN.exec(text)) !== null) {
      const sentence = extractSentence(text, m.index);
      claims.push({
        sectionId: section.id,
        text: sentence,
        type: "quantitative",
        references: extractSectionReferences(sentence, allSections),
      });
    }
  }

  if (DIRECTIONAL_PATTERN.test(text)) {
    DIRECTIONAL_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIRECTIONAL_PATTERN.exec(text)) !== null) {
      const sentence = extractSentence(text, m.index);
      claims.push({
        sectionId: section.id,
        text: sentence,
        type: "directional",
        references: extractSectionReferences(sentence, allSections),
      });
    }
  }

  if (DEFINITIONAL_PATTERN.test(text)) {
    DEFINITIONAL_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DEFINITIONAL_PATTERN.exec(text)) !== null) {
      const sentence = extractSentence(text, m.index);
      claims.push({
        sectionId: section.id,
        text: sentence,
        type: "definitional",
        references: extractSectionReferences(sentence, allSections),
      });
    }
  }

  if (FORWARD_REF_PATTERN.test(text)) {
    FORWARD_REF_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FORWARD_REF_PATTERN.exec(text)) !== null) {
      const sentence = extractSentence(text, m.index);
      claims.push({
        sectionId: section.id,
        text: sentence,
        type: "forward-ref",
        references: extractSectionReferences(sentence, allSections),
      });
    }
  }

  if (BACKWARD_REF_PATTERN.test(text)) {
    BACKWARD_REF_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BACKWARD_REF_PATTERN.exec(text)) !== null) {
      const sentence = extractSentence(text, m.index);
      claims.push({
        sectionId: section.id,
        text: sentence,
        type: "backward-ref",
        references: extractSectionReferences(sentence, allSections),
      });
    }
  }

  return claims;
}

/**
 * Extracts the sentence containing the given character offset.
 *
 * @param text - Full section text.
 * @param offset - Character offset of the match.
 * @returns The sentence, trimmed.
 */
function extractSentence(text: string, offset: number): string {
  const sentenceStart = text.lastIndexOf(".", offset - 1) + 1;
  const sentenceEnd = text.indexOf(".", offset);
  const end = sentenceEnd === -1 ? text.length : sentenceEnd + 1;
  return text.slice(sentenceStart, end).trim();
}

/**
 * Builds the full section dependency graph for a paper.
 * A section A depends on section B if A contains references to B.
 *
 * @param sections - All parsed sections.
 * @returns ParsedPaper with claims and dependency graph.
 */
export function buildPaperDependencies(
  sections: ReadonlyArray<PaperSection>
): ParsedPaper {
  const allClaims: Claim[] = [];
  const dependencies = new Map<string, Set<string>>();

  for (const section of sections) {
    dependencies.set(section.id, new Set());
    const claims = extractClaimsFromSection(section, sections);
    allClaims.push(...claims);

    for (const claim of claims) {
      for (const ref of claim.references) {
        dependencies.get(section.id)!.add(ref);
      }
    }
  }

  return {
    sections,
    claims: allClaims,
    dependencies: new Map([...dependencies].map(([k, v]) => [k, new Set(v)])),
  };
}

/**
 * Given a set of changed section IDs and the full dependency graph,
 * returns the set of section IDs that need re-auditing.
 *
 * @param changedSectionIds - Sections that were modified.
 * @param paper - Full parsed paper with dependency graph.
 * @returns Set of section IDs requiring re-audit (excludes the changed sections themselves).
 */
export function findAffectedSections(
  changedSectionIds: ReadonlyArray<string>,
  paper: ParsedPaper
): ReadonlySet<string> {
  const affected = new Set<string>();
  const changed = new Set(changedSectionIds);

  // A section is affected if it depends on (references) any changed section,
  // OR if a changed section depends on it (it may no longer be accurately cited).
  for (const [sectionId, deps] of paper.dependencies) {
    if (changed.has(sectionId)) continue; // already being rewritten

    for (const dep of deps) {
      if (changed.has(dep)) {
        affected.add(sectionId);
        break;
      }
    }
  }

  // Also: the changed sections themselves reference other sections
  // that now need to be checked for consistency with the new version.
  for (const changedId of changedSectionIds) {
    const deps = paper.dependencies.get(changedId);
    if (deps) {
      for (const dep of deps) {
        if (!changed.has(dep)) affected.add(dep);
      }
    }
  }

  return affected;
}
