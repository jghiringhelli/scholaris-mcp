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

// ── Prohibition scanner ────────────────────────────────────────────────────

export type ProhibitionSeverity = "minor" | "major" | "critical";

/** A single academic writing anti-pattern found in the paper. */
export interface ProhibitionFinding {
  /** Section title + paragraph number, e.g. "§Introduction P3" */
  location: string;
  /** The exact matched phrase, up to 80 characters */
  quoted_text: string;
  /** Machine-readable rule identifier, e.g. "well-known" */
  ruleId: string;
  /** Short rule label for display */
  rule: string;
  /** Why this is a problem */
  description: string;
  /** Concrete fix */
  suggestion: string;
  severity: ProhibitionSeverity;
}

export interface ProhibitionScanResult {
  findings: ProhibitionFinding[];
  counts: { critical: number; major: number; minor: number };
  verdict: "clean" | "minor-issues" | "needs-attention";
  summary: string;
}

// ── Semantic section graph ─────────────────────────────────────────────────

/** Directed edge in the section dependency graph. */
export interface SemanticEdge {
  targetId: string;
  targetTitle: string;
  /** TF-IDF cosine similarity (0–1) or 1.0 for explicit cross-references */
  similarity: number;
  /** How the dependency was detected */
  type: "semantic" | "explicit";
}

/** Full semantic dependency graph: sectionId → edges to coupled sections */
export type SemanticGraph = Map<string, SemanticEdge[]>;

// ── Citation protection ────────────────────────────────────────────────────

/** A paper returned from the Semantic Scholar (or arXiv) API. */
export interface S2Paper {
  paperId: string;
  title: string;
  authors: ReadonlyArray<{ name: string }>;
  year: number | null;
  abstract: string | null;
  /** Slim reference list (paperId + title only — sufficient for citation matching) */
  references?: ReadonlyArray<{ paperId: string; title: string | null }>;
  openAccessPdf?: { url: string } | null;
  externalIds?: {
    ArXiv?: string;
    DOI?: string;
    [key: string]: string | undefined;
  };
}

/** Similarity tier between a retrieved paper and the user's work. */
export type SimilarityTier = "high" | "moderate" | "low";

/** A single result item in the citation protection report. */
export interface CitationOmission {
  paperId: string;
  title: string;
  authors: string;
  year: number | null;
  /** URL to the paper (open access PDF or S2 URL) */
  url: string;
  /** The claim phrase that triggered this match */
  matchedClaim: string;
  /** How similar the paper's abstract is to the user's claims */
  similarityTier: SimilarityTier;
  /** Vocabulary overlap score (0–1) */
  overlapScore: number;
  /** Whether this paper appears to cite the user's work */
  citesYourWork: boolean;
}

// ── Compression analysis ──────────────────────────────────────────────────

/**
 * Verdict assigned to each section during compression analysis.
 * - load-bearing: unique content, do not touch
 * - remove:       near-duplicate of an earlier section; the earlier one wins
 * - compress:     moderate overlap or disproportionate length; tighten
 * - relocate:     important but topically misaligned with its position
 * - review:       borderline; human judgment required
 */
export type CompressionVerdict = "load-bearing" | "remove" | "compress" | "relocate" | "review";

/** Per-section result from a compression audit. */
export interface SectionCompressionResult {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly wordCount: number;
  readonly pctOfTotal: number;
  readonly verdict: CompressionVerdict;
  readonly reason: string;
  /** Title of the section this one most overlaps with, if any. */
  readonly mostSimilarSection?: string;
  readonly maxCosineSimilarity: number;
}

/** A pair of passages from two different sections that repeat the same idea. */
export interface CompressionPassagePair {
  readonly section1Title: string;
  readonly section2Title: string;
  readonly passage1: string;
  readonly passage2: string;
  /** Jaccard 5-gram similarity (0–1). */
  readonly jaccardScore: number;
}

/** Full compression report returned by the compress_draft action. */
export interface CompressionReport {
  readonly totalWords: number;
  readonly totalSections: number;
  /** Estimated fraction of words that are redundant (0–1). */
  readonly estimatedRedundancyPct: number;
  readonly structuralAlerts: ReadonlyArray<string>;
  readonly repetitionPairs: ReadonlyArray<CompressionPassagePair>;
  readonly sections: ReadonlyArray<SectionCompressionResult>;
  readonly summary: string;
}

// ── Plagiarism detection ───────────────────────────────────────────────────

/** Risk tier for overall similarity between two papers. */
export type PlagiarismRiskTier = "high-risk" | "moderate" | "low";

/** A suspicious sentence pair between source and a reference paper. */
export interface SuspiciousPassage {
  sourcePassage: string;
  referencePassage: string;
  /** Jaccard n-gram similarity score (0–1). */
  score: number;
}

/** Similarity result for one source-vs-reference pair. */
export interface PaperSimilarityResult {
  /** Title of the reference paper (your prior work). */
  referenceTitle: string;
  referenceDoi: string | null;
  referenceAuthors: string;
  referenceYear: number | null;
  /** Whether analysis was limited to the abstract (full text unavailable). */
  abstractOnly: boolean;
  /** TF-IDF cosine similarity (0–1): topical overlap. */
  cosineSimilarity: number;
  /** Document-level 5-gram Jaccard (0–1): verbatim / near-verbatim copying. */
  ngramJaccard: number;
  /** Combined risk tier derived from both scores. */
  tier: PlagiarismRiskTier;
  /** Top suspicious passage pairs (highest Jaccard first). */
  suspiciousPassages: SuspiciousPassage[];
}

/** Full plagiarism detection report. */
export interface PlagiarismReport {
  sourceTitle: string | null;
  sourceDoi: string | null;
  abstractOnly: boolean;
  results: PaperSimilarityResult[];
  summary: string;
}

/** Full citation protection report. */
export interface CitationReport {
  queriedClaims: ReadonlyArray<string>;
  omissions: CitationOmission[];    // papers that do NOT cite you
  citing: CitationOmission[];       // papers that DO cite you (for reference)
  totalResultsScanned: number;
  apiErrors: string[];
  summary: string;
}
