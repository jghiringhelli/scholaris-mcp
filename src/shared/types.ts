/**
 * Shared domain types for scholaris-mcp.
 * All cross-cutting DTOs live here; feature files never define their own shared types.
 */

// ── Venue ─────────────────────────────────────────────────────────────────

/** Supported target venues for submission readiness checks. */
export type VenueId =
  | "arxiv"
  | "ieee"
  | "acm"
  | "nature"
  | "neurips"
  | "icml"
  | "general";

/** Severity levels used across review dimensions. */
export type Severity = "critical" | "high" | "medium" | "low";

/** A single submission criterion from a venue profile. */
export interface VenueCriterion {
  readonly id: string;
  readonly description: string;
  readonly severity: Severity;
  /** Which paper sections this criterion applies to. */
  readonly check_in: ReadonlyArray<string>;
}

/** Loaded venue profile from YAML template. */
export interface VenueProfile {
  readonly id: VenueId;
  readonly name: string;
  readonly category: string;
  readonly sections: {
    readonly required: ReadonlyArray<string>;
    readonly optional: ReadonlyArray<string>;
  };
  readonly formatting: {
    readonly style?: string;
    readonly citation?: string;
    readonly page_limit?: number | null;
    readonly max_pages?: number | null;
    readonly anonymous?: boolean;
    readonly double_blind?: boolean;
    readonly citation_style?: string;
  };
  readonly criteria: ReadonlyArray<VenueCriterion>;
  readonly rejection_patterns: ReadonlyArray<string>;
  readonly submission_notes: string;
}

// ── Review profiles ────────────────────────────────────────────────────────

/** Available review profile names. */
export type ReviewProfileId = "logical" | "rhetorical" | "structural" | "style";

/** A single review dimension within a profile. */
export interface ReviewDimension {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Specific prompts/questions to evaluate against. */
  readonly prompts: ReadonlyArray<string>;
  readonly severity_guide: {
    readonly critical: string;
    readonly high: string;
    readonly medium: string;
  };
}

/** Loaded review profile from YAML template. */
export interface ReviewProfile {
  readonly id: ReviewProfileId;
  readonly name: string;
  readonly description: string;
  readonly dimensions: ReadonlyArray<ReviewDimension>;
  readonly report_format: {
    readonly per_section: boolean;
    readonly include_quotes: boolean;
    readonly remediation: boolean;
  };
}

// ── Paper structure ────────────────────────────────────────────────────────

/** A single parsed section of a paper. */
export interface PaperSection {
  readonly id: string;        // slug: "introduction", "related-work"
  readonly title: string;     // Original heading text
  readonly level: number;     // 1 = top-level, 2 = subsection, etc.
  readonly index: number;     // Sequential 0-based position
  readonly content: string;   // Text body of the section
  readonly charStart: number; // Character offset in original text
  readonly charEnd: number;
}

/** A single claim extracted from a section. */
export interface Claim {
  readonly sectionId: string;
  readonly text: string;
  readonly type: "quantitative" | "directional" | "definitional" | "forward-ref" | "backward-ref";
  /** Other section IDs this claim references. */
  readonly references: ReadonlyArray<string>;
}

/** Fully parsed paper structure. */
export interface ParsedPaper {
  readonly sections: ReadonlyArray<PaperSection>;
  readonly claims: ReadonlyArray<Claim>;
  /** Section dependency graph: sectionId → sections it depends on. */
  readonly dependencies: ReadonlyMap<string, ReadonlySet<string>>;
}

// ── Tool output ────────────────────────────────────────────────────────────

/** Standard MCP content item returned by all handlers. */
export interface ContentItem {
  type: "text";
  text: string;
}

/** Standard handler response shape. */
export interface HandlerResult {
  content: ContentItem[];
  isError?: boolean;
  next_steps?: ReadonlyArray<string>;
  files_created?: ReadonlyArray<string>;
}
