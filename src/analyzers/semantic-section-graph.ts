/**
 * Semantic section graph.
 *
 * Builds a dependency graph over paper sections using two complementary signals:
 *   1. TF-IDF cosine similarity — detects topical coupling without explicit references
 *   2. Explicit cross-references from claim-extractor — "See Section 3", "§4.2"
 *
 * The combined graph feeds diff_audit's cascade detection, giving a far richer
 * picture than explicit references alone:
 *   - §Introduction and §Conclusion always couple tightly (shared contribution narrative)
 *   - §Method and §Experiments couple on shared technical vocabulary
 *   - §Abstract couples to everything (it summarises the whole paper)
 *
 * Thresholds (tuned for academic papers):
 *   WEAK_COUPLING   0.20 — same broad topic area
 *   COUPLING        0.30 — clearly related sections that cascade
 *   STRONG_COUPLING 0.45 — deeply intertwined (revising one almost certainly
 *                          requires revising the other)
 */

import type { PaperSection, SemanticEdge, SemanticGraph } from "../shared/types.js";
import { buildTFIDFVectors, cosineSim } from "./tfidf.js";

export type { SemanticEdge, SemanticGraph };

export const COUPLING_THRESHOLD = 0.20;
export const STRONG_COUPLING_THRESHOLD = 0.40;

// ── Graph builder ──────────────────────────────────────────────────────────

/**
 * Builds the full semantic dependency graph for a set of paper sections.
 *
 * Each node is a section; edges point to sections it is semantically coupled
 * with or explicitly references. Edge list is sorted by similarity descending.
 *
 * @param sections  - Parsed sections from section-parser.
 * @param explicitDeps - Explicit reference map from buildPaperDependencies().
 * @returns SemanticGraph (Map from sectionId to SemanticEdge[]).
 */
export function buildSemanticSectionGraph(
  sections: ReadonlyArray<PaperSection>,
  explicitDeps: ReadonlyMap<string, ReadonlySet<string>>
): SemanticGraph {
  const graph: SemanticGraph = new Map();
  if (sections.length === 0) return graph;

  // Build TF-IDF vectors for all section bodies
  const texts = sections.map((s) => s.content);
  const { vectors } = buildTFIDFVectors(texts);

  for (let i = 0; i < sections.length; i++) {
    const sectionA = sections[i]!;
    const edges: SemanticEdge[] = [];

    // ── Semantic edges (TF-IDF) ────────────────────────────────────────────
    for (let j = 0; j < sections.length; j++) {
      if (i === j) continue;
      const sectionB = sections[j]!;
      const sim = cosineSim(vectors[i]!, vectors[j]!);

      if (sim >= COUPLING_THRESHOLD) {
        edges.push({
          targetId: sectionB.id,
          targetTitle: sectionB.title,
          similarity: parseFloat(sim.toFixed(3)),
          type: "semantic",
        });
      }
    }

    // ── Explicit edges (cross-references) ─────────────────────────────────
    const explicit = explicitDeps.get(sectionA.id) ?? new Set<string>();
    for (const depId of explicit) {
      const existing = edges.find((e) => e.targetId === depId);
      if (existing) {
        // Upgrade to explicit — treat cosine as a lower bound; explicit ref is certain
        existing.type = "explicit";
      } else {
        const depSection = sections.find((s) => s.id === depId);
        if (depSection) {
          edges.push({
            targetId: depId,
            targetTitle: depSection.title,
            similarity: 1.0, // explicit reference = certain coupling
            type: "explicit",
          });
        }
      }
    }

    // Sort: explicit first, then by similarity descending
    edges.sort((a, b) => {
      if (a.type === "explicit" && b.type !== "explicit") return -1;
      if (b.type === "explicit" && a.type !== "explicit") return 1;
      return b.similarity - a.similarity;
    });

    graph.set(sectionA.id, edges);
  }

  return graph;
}

// ── Cascade finder ─────────────────────────────────────────────────────────

export interface CascadeEntry {
  /** Edges from this section to the changed sections (or vice-versa) */
  incomingEdges: SemanticEdge[];
  /** Maximum similarity to any changed section */
  maxSimilarity: number;
  /** True if at least one edge is an explicit cross-reference */
  hasExplicitRef: boolean;
}

/**
 * Finds all sections that are semantically or explicitly coupled to any
 * of the changed sections — the cascade set.
 *
 * Includes both:
 *   (a) sections that point TO a changed section (they may reference stale info)
 *   (b) sections that a changed section points TO (its claims about them may now
 *       be incorrect)
 *
 * @param changedIds - Section IDs that were modified.
 * @param graph      - Semantic graph from buildSemanticSectionGraph().
 * @returns Map from affected sectionId to cascade metadata.
 */
export function findCascade(
  changedIds: ReadonlyArray<string>,
  graph: SemanticGraph
): Map<string, CascadeEntry> {
  const affected = new Map<string, CascadeEntry>();
  const changed = new Set(changedIds);

  // (a) Sections that couple TO any changed section
  for (const [sectionId, edges] of graph) {
    if (changed.has(sectionId)) continue;

    const relevant = edges.filter((e) => changed.has(e.targetId));
    if (relevant.length === 0) continue;

    const maxSim = Math.max(...relevant.map((e) => e.similarity));
    const hasExplicitRef = relevant.some((e) => e.type === "explicit");
    affected.set(sectionId, { incomingEdges: relevant, maxSimilarity: maxSim, hasExplicitRef });
  }

  // (b) Sections that changed sections point TO (reverse cascade)
  for (const changedId of changedIds) {
    const edges = graph.get(changedId) ?? [];
    for (const edge of edges) {
      if (changed.has(edge.targetId)) continue;

      const existing = affected.get(edge.targetId);
      if (existing) {
        // Merge: take max similarity, upgrade to explicit if applicable
        if (edge.similarity > existing.maxSimilarity) existing.maxSimilarity = edge.similarity;
        if (edge.type === "explicit") existing.hasExplicitRef = true;
        existing.incomingEdges.push({ ...edge, targetId: changedId, targetTitle: changedId });
      } else {
        affected.set(edge.targetId, {
          incomingEdges: [{ ...edge, targetId: changedId, targetTitle: changedId }],
          maxSimilarity: edge.similarity,
          hasExplicitRef: edge.type === "explicit",
        });
      }
    }
  }

  return affected;
}

// ── Rendering ──────────────────────────────────────────────────────────────

/**
 * Returns a coupling strength label for display.
 */
export function couplingLabel(similarity: number, type: SemanticEdge["type"]): string {
  if (type === "explicit") return "explicit reference";
  if (similarity >= STRONG_COUPLING_THRESHOLD) return "strongly coupled";
  return "semantically coupled";
}
