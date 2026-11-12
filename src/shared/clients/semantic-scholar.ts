/**
 * Semantic Scholar API client.
 *
 * Uses the public graph API (no key required for ≤1 req/sec).
 * Set SEMANTIC_SCHOLAR_API_KEY in the environment to raise the rate limit
 * to 10 req/sec and access larger field sets.
 *
 * Docs: https://api.semanticscholar.org/api-docs/
 */

import type { S2Paper } from "../types.js";

export type { S2Paper };

const BASE = "https://api.semanticscholar.org/graph/v1";

// Fields we always request for citation protection analysis
const PAPER_FIELDS = [
  "paperId",
  "title",
  "authors",
  "year",
  "abstract",
  "references.paperId",
  "references.title",
  "openAccessPdf",
  "externalIds",
].join(",");

// ── Rate limiting ──────────────────────────────────────────────────────────

/** Minimum gap between API calls (ms). 1100ms is conservative for the unauthenticated tier. */
const MIN_INTERVAL_MS = 1100;
let _lastCallAt = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - _lastCallAt));
  if (wait > 0) await sleep(wait);
  _lastCallAt = Date.now();

  const apiKey = process.env["SEMANTIC_SCHOLAR_API_KEY"];
  const headers: Record<string, string> = {
    "User-Agent": "Scholaris-MCP/0.1 (academic paper review tool; https://github.com/jghiringhelli/scholaris-mcp)",
  };
  if (apiKey) headers["x-api-key"] = apiKey;

  return fetch(url, { headers });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Paper search ───────────────────────────────────────────────────────────

/**
 * Searches Semantic Scholar for papers matching a free-text query.
 *
 * @param query  - Search query (claim phrase, title fragment, or topic).
 * @param limit  - Max results (1–10; capped at 10 to respect rate limits).
 * @returns Array of S2 paper objects, empty on API failure.
 */
export async function searchPapers(query: string, limit = 5): Promise<S2Paper[]> {
  const safeLimit = Math.min(Math.max(1, limit), 10);
  const url =
    `${BASE}/paper/search` +
    `?query=${encodeURIComponent(query)}` +
    `&limit=${safeLimit}` +
    `&fields=${PAPER_FIELDS}`;

  const res = await rateLimitedFetch(url);

  if (res.status === 429) {
    throw new S2RateLimitError("Semantic Scholar rate limit exceeded. Retry after a few seconds.");
  }
  if (!res.ok) {
    throw new S2ApiError(`Semantic Scholar API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { data?: unknown[] };
  return (data.data ?? []) as S2Paper[];
}

/**
 * Resolves a DOI to a Semantic Scholar paper record.
 * Returns null if the DOI is not found in S2 (rather than throwing),
 * since not all DOIs are indexed.
 *
 * @param doi - DOI string, with or without the "https://doi.org/" prefix.
 * @returns The S2Paper record, or null if not indexed.
 */
export async function resolveByDoi(doi: string): Promise<S2Paper | null> {
  const rawDoi = doi.replace(/^https?:\/\/doi\.org\//i, "");
  const url = `${BASE}/paper/DOI:${encodeURIComponent(rawDoi)}?fields=${PAPER_FIELDS}`;

  const res = await rateLimitedFetch(url);

  if (res.status === 404) return null;
  if (res.status === 429) {
    throw new S2RateLimitError("Semantic Scholar rate limit exceeded. Retry after a few seconds.");
  }
  if (!res.ok) {
    throw new S2ApiError(`Semantic Scholar API error for DOI ${rawDoi}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as S2Paper;
}

/**
 * Looks up a specific paper by title (best-effort: returns first result if title matches).
 * Used to find the user's own paper so we can check who cites it.
 *
 * @param title   - Exact or near-exact paper title.
 * @returns The matching S2Paper, or null if not found.
 */
export async function lookupPaperByTitle(title: string): Promise<S2Paper | null> {
  const results = await searchPapers(title, 3);
  if (results.length === 0) return null;

  // Best match: title normalisation for comparison
  const norm = normaliseTitle(title);
  const exact = results.find((p) => normaliseTitle(p.title) === norm);
  return exact ?? results[0] ?? null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Lowercases, strips punctuation, collapses whitespace. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if `paperTitle` looks like it references `targetTitle`.
 * Uses normalised substring matching to handle minor formatting differences.
 */
export function titleMatchesReference(
  paperTitle: string | null | undefined,
  targetTitle: string
): boolean {
  if (!paperTitle || !targetTitle) return false;
  const normPaper = normaliseTitle(paperTitle);
  const normTarget = normaliseTitle(targetTitle);
  // Require at least 10 chars to avoid spurious matches on very short titles
  if (normTarget.length < 10) return normPaper === normTarget;
  return normPaper.includes(normTarget) || normTarget.includes(normPaper);
}

/**
 * Checks if a paper's reference list contains a specific title.
 */
export function paperCitesTitle(
  paper: S2Paper,
  targetTitle: string
): boolean {
  const refs = paper.references ?? [];
  return refs.some((r) => titleMatchesReference(r.title, targetTitle));
}

/**
 * Returns the best URL for a paper (open access PDF > S2 page > arXiv).
 */
export function paperUrl(paper: S2Paper): string {
  if (paper.openAccessPdf?.url) return paper.openAccessPdf.url;
  const arxivId = paper.externalIds?.ArXiv;
  if (arxivId) return `https://arxiv.org/abs/${arxivId}`;
  return `https://www.semanticscholar.org/paper/${paper.paperId}`;
}

// ── Error types ────────────────────────────────────────────────────────────

export class S2ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "S2ApiError";
  }
}

export class S2RateLimitError extends S2ApiError {
  constructor(message: string) {
    super(message);
    this.name = "S2RateLimitError";
  }
}
