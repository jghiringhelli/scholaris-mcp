/**
 * Prohibition scanner for academic paper prose.
 *
 * Detects common writing anti-patterns using regex rules before any LLM call.
 * Runs in <5ms on any paper length. Findings include exact location, quoted text,
 * rule name, description, and a concrete fix suggestion.
 *
 * Severity:
 *   critical — directly undermines credibility (reviewers will reject)
 *   major    — reviewers will flag; must be addressed
 *   minor    — style issues that weaken the paper
 */

import type { PaperSection } from "../shared/types.js";
import type {
  ProhibitionFinding,
  ProhibitionScanResult,
  ProhibitionSeverity,
} from "../shared/types.js";

export type { ProhibitionFinding, ProhibitionScanResult };

// ── Rule definition ────────────────────────────────────────────────────────

interface ProhibitionRule {
  id: string;
  label: string;
  pattern: RegExp;
  description: string;
  suggestion: string;
  severity: ProhibitionSeverity;
}

// ── Rule catalogue ─────────────────────────────────────────────────────────

const RULES: ProhibitionRule[] = [
  // ── Critical ─────────────────────────────────────────────────────────────

  {
    id: "future-tense-completed",
    label: "Future tense for completed work",
    pattern:
      /\bwe will (?:show|demonstrate|prove|present|discuss|describe|analyze|analyse|investigate|introduce|propose|evaluate|compare)\b/gi,
    description:
      '"We will X" implies the work is not done yet. In a completed paper this is incorrect.',
    suggestion: 'Replace with past or present tense: "we show", "we demonstrate", "we present".',
    severity: "critical",
  },
  {
    id: "unquantified-superiority",
    label: "Unquantified performance claim",
    pattern:
      /\b(?:much|greatly|significantly|considerably|substantially|markedly|dramatically)\s+(?:better|faster|more accurate|more efficient|improved|superior|outperform\w*)\b(?![^.]*\d)/gi,
    description:
      "Performance claims without numbers cannot be verified. Reviewers will demand quantification.",
    suggestion: "Cite the specific metric and margin: \"improves F1 by 4.2 points (from 81.3 to 85.5)\".",
    severity: "critical",
  },
  {
    id: "we-believe-technical",
    label: '"We believe / we think" in technical claim',
    pattern: /\b(?:we believe|we think|i believe|i think|in my opinion|we feel)\b/gi,
    description:
      "Epistemic hedges signal uncertainty about your own results. Technical claims should be supported by evidence.",
    suggestion: "Remove the hedge; state the finding directly with evidence: \"Results show that...\"",
    severity: "critical",
  },

  // ── Major ─────────────────────────────────────────────────────────────────

  {
    id: "obviously-clearly",
    label: '"Obviously" / "clearly" on a non-trivial claim',
    pattern:
      /\b(?:clearly|obviously|trivially|evidently|it is obvious(?: that)?|it is clear(?: that)?|needless to say)\b/gi,
    description:
      "If it were obvious, no paper would be needed. Using these words alienates readers who don't find it obvious.",
    suggestion: "Delete the word; let the argument carry itself. If the claim needs support, add a citation.",
    severity: "major",
  },
  {
    id: "well-known",
    label: '"It is well known" without citation',
    pattern:
      /\bit is (?:well[- ]known|widely (?:known|accepted|acknowledged)|generally (?:known|accepted|recognized)|commonly (?:known|accepted))\b/gi,
    description:
      "\"Well-known\" claims require a citation. Reviewers who don't know them will penalise the claim.",
    suggestion: "Either add [Author, Year] or rephrase: \"Prior work establishes that... [citation].\"",
    severity: "major",
  },
  {
    id: "it-seems-appears",
    label: '"It seems / it appears" hedging a key claim',
    pattern: /\bit (?:seems?|appears?)\s+(?:that\s+)?(?:the|our|this|these|a\s)/gi,
    description:
      "Epistemic hedging on factual claims suggests you don't trust your own results.",
    suggestion: "Replace with direct assertion if the finding is supported by your data.",
    severity: "major",
  },
  {
    id: "in-this-paper-we",
    label: '"In this paper we" — metatextual opener',
    pattern: /\bin this paper,?\s+we\b/gi,
    description:
      "Reviewers are reading the paper; they know it's a paper. This phrasing wastes words and often signals a weak abstract.",
    suggestion: "Start with the contribution: \"We propose X...\" or \"This work introduces X...\"",
    severity: "major",
  },
  {
    id: "novel-contribution",
    label: '"Novel contribution" — tautology',
    pattern: /\bnovel (?:contribution|approach|method|technique|framework|algorithm)\b/gi,
    description:
      "\"Contribution\" already implies novelty. Doubling up signals unfamiliarity with academic style.",
    suggestion: "Remove \"novel\": \"our contribution\" or \"our approach\".",
    severity: "major",
  },
  {
    id: "passive-vague-agent",
    label: "Vague passive: \"it has been shown that\"",
    pattern:
      /\bit (?:has been|was|is|have been)\s+(?:shown|demonstrated|found|observed|reported|noted|established|proven|argued)\s+that\b/gi,
    description:
      "Vague passive hides the source. Reviewers cannot evaluate the claim without knowing who showed it.",
    suggestion: "Name the source: \"Smith et al. (2023) show that...\" or \"Prior work demonstrates [citation]...\"",
    severity: "major",
  },
  {
    id: "promising-results",
    label: '"Promising / encouraging results"',
    pattern: /\b(?:promising|encouraging|satisfactory|reasonable|acceptable)\s+(?:results?|performance|outcomes?)\b/gi,
    description:
      "Qualitative judgment without numbers. \"Promising\" is what you say about work that doesn't yet meet the bar.",
    suggestion: "Replace with the actual metric: \"achieves 89.4% accuracy, within 1.2pp of the supervised baseline\".",
    severity: "major",
  },

  // ── Minor ─────────────────────────────────────────────────────────────────

  {
    id: "rest-of-paper",
    label: '"The rest of this paper is organized as follows"',
    pattern:
      /\bthe rest of this paper\b|\bthe remainder of this paper\b|\bthis paper is organized as follows\b/gi,
    description:
      "Roadmap paragraphs consume valuable space and are rarely read. Top venues discourage them.",
    suggestion: "Delete the roadmap paragraph. If navigation is needed, use a one-sentence transition instead.",
    severity: "minor",
  },
  {
    id: "in-order-to",
    label: '"In order to" — verbose',
    pattern: /\bin order to\b/gi,
    description: "\"In order to\" can always be shortened to \"to\" without loss of meaning.",
    suggestion: "Replace with \"to\".",
    severity: "minor",
  },
  {
    id: "due-to-the-fact",
    label: '"Due to the fact that" — verbose',
    pattern: /\bdue to the fact that\b/gi,
    description: "Wordy. Use \"because\" instead.",
    suggestion: "Replace with \"because\".",
    severity: "minor",
  },
  {
    id: "empty-intensifier",
    label: "Empty intensifier",
    pattern: /\b(?:very|quite|rather|somewhat|fairly)\s+(?:important|useful|effective|efficient|powerful|simple|complex|challenging|interesting|significant)\b/gi,
    description:
      "Intensifiers add no information. \"Very important\" and \"important\" are equivalent to a reader.",
    suggestion: "Remove the intensifier; if emphasis is needed, show it through placement or evidence.",
    severity: "minor",
  },
  {
    id: "it-should-be-noted",
    label: '"It should be noted / it is worth noting"',
    pattern: /\b(?:it should be noted(?: that)?|it is worth noting(?: that)?|note that|we note that)\b/gi,
    description:
      "Meta-commentary. If something is worth noting, note it directly without announcing you're noting it.",
    suggestion: "Delete the phrase and state the point directly.",
    severity: "minor",
  },
  {
    id: "state-of-the-art-bare",
    label: '"State-of-the-art" without citation or metric',
    pattern: /\bstate[- ]of[- ]the[- ]art\b(?![^.]*(?:\[|\(\d{4}\)|et al\.))/gi,
    description:
      "\"State-of-the-art\" without a citation or metric is unverifiable marketing language.",
    suggestion: "Add the specific model/paper/metric: \"outperforms the current SOTA (ModelX, 2024) by 2.1 F1\".",
    severity: "minor",
  },
];

// ── Scanner ────────────────────────────────────────────────────────────────

/**
 * Scans a paper (provided as sections) for academic writing anti-patterns.
 * Paragraph-indexed: each finding records which section and paragraph it appears in.
 *
 * @param sections - Parsed paper sections from section-parser.
 * @returns Structured scan result with per-finding location, rule, and suggestion.
 */
export function scanProhibitions(sections: ReadonlyArray<PaperSection>): ProhibitionScanResult {
  const findings: ProhibitionFinding[] = [];

  for (const section of sections) {
    const paragraphs = splitParagraphs(section.content);

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx]!;
      const location = `§${section.title} P${pIdx + 1}`;

      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = rule.pattern.exec(para)) !== null) {
          const snippet = extractSnippet(para, match.index, match[0].length);
          findings.push({
            location,
            quoted_text: snippet,
            ruleId: rule.id,
            rule: rule.label,
            description: rule.description,
            suggestion: rule.suggestion,
            severity: rule.severity,
          });
        }
      }
    }
  }

  // Deduplicate: same rule + same quoted_text in same location
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = `${f.location}|${f.ruleId}|${f.quoted_text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: critical first, then major, then minor
  const severityRank: Record<ProhibitionSeverity, number> = { critical: 0, major: 1, minor: 2 };
  unique.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const counts = {
    critical: unique.filter((f) => f.severity === "critical").length,
    major: unique.filter((f) => f.severity === "major").length,
    minor: unique.filter((f) => f.severity === "minor").length,
  };

  const verdict =
    counts.critical > 0 ? "needs-attention"
    : counts.major > 3 ? "needs-attention"
    : counts.major > 0 || counts.minor > 5 ? "minor-issues"
    : "clean";

  const summary =
    unique.length === 0
      ? "No prohibition patterns detected."
      : `${unique.length} finding(s): ${counts.critical} critical, ${counts.major} major, ${counts.minor} minor.`;

  return { findings: unique, counts, verdict, summary };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

/**
 * Extracts a readable snippet centered on the match, capped at 80 chars.
 */
function extractSnippet(text: string, offset: number, matchLen: number): string {
  const start = Math.max(0, offset - 20);
  const end = Math.min(text.length, offset + matchLen + 40);
  const raw = text.slice(start, end).replace(/\s+/g, " ").trim();
  return raw.length <= 80 ? raw : raw.slice(0, 77) + "…";
}

/**
 * Renders scan results as a markdown pre-flight block suitable for
 * prepending to a review protocol.
 *
 * @param result - Scan result from scanProhibitions().
 * @returns Markdown string, or empty string if clean.
 */
export function renderProhibitionBlock(result: ProhibitionScanResult): string {
  if (result.findings.length === 0) return "";

  const badge: Record<ProhibitionSeverity, string> = {
    critical: "🔴",
    major: "🟠",
    minor: "🟡",
  };

  const rows = result.findings.map(
    (f, i) =>
      `| ${i + 1} | ${f.location} | ${badge[f.severity]} **${f.rule}** \`[${f.ruleId}]\` | \`${f.quoted_text}\` |`
  );

  const details = result.findings.map(
    (f, i) =>
      `**${i + 1}. ${badge[f.severity]} ${f.rule}** (${f.severity}) — ${f.location}\n` +
      `- *Issue:* ${f.description}\n` +
      `- *Fix:* ${f.suggestion}`
  );

  return [
    "## 🔍 Pre-flight: Prohibition Scan",
    "",
    `**${result.summary}** Verdict: \`${result.verdict}\``,
    "",
    "Address critical and major findings before requesting peer review.",
    "",
    "| # | Location | Rule | Flagged text |",
    "|---|----------|------|--------------|",
    ...rows,
    "",
    "### Details",
    "",
    details.join("\n\n"),
    "",
    "─".repeat(70),
    "",
    "",
  ].join("\n");
}
