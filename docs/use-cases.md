# Use Cases — scholaris-mcp

## UC-001: Conduct Structured Self-Review Before First Submission

**Actor**: PhD student preparing a paper for NeurIPS submission

**Precondition**: Complete draft paper (5–10k words, multiple sections); scholaris-mcp installed in Claude Desktop.

**Steps**:
1. Actor invokes `scholaris(action: "review_paper", paper_text: "...", venue: "neurips", profiles: ["logical", "structural", "style"])`.
2. System parses paper into sections; loads NeurIPS venue profile and 3 review profiles from YAML.
3. System applies each dimension's prompts to relevant sections; returns structured report with severity levels (critical/high/medium/low) and remediation guidance.
4. Actor reads report and makes targeted revisions.

**Outcome**: Prioritized list of 5–15 structural, logical, and style issues. Each finding includes a specific quote from the paper and suggested remediation, calibrated to NeurIPS standards.

---

## UC-002: Detect Cascade Effects After Revising Introduction and Related Work

**Actor**: Postdoc revising a paper after initial feedback

**Precondition**: Paper previously passed `review_paper`; §Introduction and §Related Work revised with changed key claims.

**Steps**:
1. Actor invokes `scholaris(action: "diff_audit", paper_text: "...", changed_sections: ["Introduction", "Related Work"], show_claims: true)`.
2. System builds explicit dependency graph (forward refs, backward refs, quantitative/directional claims) and semantic coupling graph (TF-IDF vocabulary overlap).
3. Returns re-audit plan with affected sections ranked by coupling strength; prompts for each affected section (e.g., "Are forward references still valid?", "Do quantitative claims align with revised results?").

**Outcome**: Prioritized list of 2–4 sections to re-audit. At least one detected via semantic coupling (not just explicit refs). False positives <15%.

---

## UC-003: Compare Venue Fit Across Multiple Targets

**Actor**: Researcher unsure whether to submit to NeurIPS, ICML, or arXiv

**Precondition**: Complete draft paper.

**Steps**:
1. Actor invokes `scholaris(action: "check_venue_fit", paper_text: "...", venues: ["neurips", "icml", "arxiv"], show_gaps: true)`.
2. System checks structural requirements (required sections present?) and vocabulary-overlap matching for each venue.
3. Returns rank-ordered comparison table with fit scores and gap analysis per venue.

**Outcome**: Fit scores per venue (e.g., "NeurIPS 85%, ICML 72%, arXiv 95%"). Each gap includes specific criterion and overlap score. Top-fit venue marked clearly with actionable gap list.

---

## UC-004: Generate Rebuttal Scaffold from Reviewer Comments

**Actor**: Author responding to 3 ICML reviewer reports

**Precondition**: Reviewer comments extracted into a text block.

**Steps**:
1. Actor invokes `scholaris(action: "generate_rebuttal", reviewer_comments: "Reviewer 1: ...\nReviewer 2: ...", venue: "ICML 2026", tone: "collegial")`.
2. System splits comments by reviewer; parses each block into individual points; classifies each (question, suggestion, concern, praise) and estimates severity (major, minor).
3. Returns scaffold: header with opening statement, per-reviewer sections with original points quoted and sorted by severity, response options [ACK]/[CLARIFY]/[REVISE] per point, Summary of Changes block.
4. Author fills in each response slot.

**Outcome**: Complete rebuttal template (2–5 pages). All reviewer points accounted for and organized by severity. Parsing finds ≥90% of individual review points.

---

## UC-005: Detect Citation Omissions from Semantic Scholar

**Actor**: Independent researcher monitoring whether similar papers cite their preprint

**Precondition**: Actor has published on arXiv; has full text of their paper.

**Steps**:
1. Actor invokes `scholaris(action: "check_citations", paper_text: "...", paper_title: "Exact Title", published_after: "2024")`.
2. System extracts key claim phrases (TF-IDF on abstract + top terms); queries Semantic Scholar API for matching papers.
3. For each result, checks whether the paper's reference list includes the actor's title.
4. Returns ranked omission table with title, authors, year, similarity score, URL; highlights high-priority omissions (≥40% vocabulary overlap).

**Outcome**: List of 5–20 papers with high vocabulary overlap not citing the actor. Total execution time <10 seconds. System handles API rate-limit errors gracefully with partial results.

---

## UC-006: Iterative Review Loop (Review → Revise → Cascade → Re-Review)

**Actor**: Senior PhD student refining through multiple self-review cycles

**Precondition**: Actor in iterative revision cycle; initial `review_paper` feedback received.

**Steps**:
1. **Cycle N:** `review_paper` returns 8–12 findings; actor revises §Introduction and §Methods.
2. **Cycle N+1 — Cascade:** `diff_audit` detects §Related Work (explicit refs), §Results (semantic coupling), §Abstract (quotes) as affected.
3. **Targeted Re-Review:** `review_paper` with `section_focus: "Results"` returns 3–5 findings; actor addresses them.
4. **Closure:** `diff_audit` on changed §Results returns 0 affected sections — cascade contained.

**Outcome**: Actor has confidence that revisions are internally consistent. Full loop (review → cascade → re-review) completes in <15 minutes. Successive `diff_audit` calls show diminishing affected sections (convergence).

---

## UC-007: Domain Expert Adds New Venue Profile

**Actor**: NeurIPS program committee member contributing venue requirements

**Precondition**: Actor understands NeurIPS review standards; comfortable with YAML (not necessarily TypeScript).

**Steps**:
1. Actor creates `templates/venues/nips2026.yaml` following documented schema: id, name, category, required/optional sections, formatting constraints, criteria with severity levels.
2. Updates `src/shared/types.ts` to register new VenueId; submits pull request.

**Outcome**: New venue available to all users without handler code changes. Community can audit and improve the profile over time. ≥5 criteria match sample NeurIPS papers with >80% accuracy.

---

## UC-008: Author Customizes Review Profiles for a Sub-domain

**Actor**: Formal verification researcher needing logic-focused review

**Precondition**: Existing profiles insufficient for formal methods papers.

**Steps**:
1. Actor creates `templates/review-profiles/formal-methods.yaml` with dimensions: theorem_clarity (unambiguous statements, explicit preconditions) and proof_structure (completeness, edge cases).
2. Updates `src/shared/types.ts`; invokes `review_paper(paper_text: "...", profiles: ["formal", "structural"])`.
3. System loads custom profile and applies theorem-focused checks.

**Outcome**: Review feedback calibrated to formal methods standards (e.g., "Theorem 2.3 missing quantifier scope"). Profile reusable and contributable back to the community.
