# scholaris-mcp — Product Requirements Document

## Problem

Academic researchers face a cascade of interconnected review tasks when preparing papers for publication:

1. **Structural review is manual and error-prone**: Authors must verify logical consistency, rhetorical clarity, structural completeness, and writing quality against venue-specific standards. When sections are revised, downstream sections develop new inconsistencies — the "cascade effect." Revising the Introduction may invalidate claims in the Discussion, which may in turn affect the Conclusion.

2. **Publication venues have incompatible standards**: The same paper may suit arXiv but fall short of NeurIPS requirements. Researchers spend hours cross-checking criteria manually. Citation formatting, section requirements, and evaluation philosophies vary widely, making it hard to assess fit early.

3. **Researchers lack citation protection**: Independent researchers without institutional monitoring (Google Scholar alerts, Clarivate services) have no way to detect when similar papers are published without citing their work.

4. **Rebuttal writing is ad-hoc**: When reviewers return comments, authors manually parse criticism and craft responses. There is no structured protocol to ensure all points are addressed with consistent tone and academic rigor.

scholaris-mcp solves these problems by automating the review protocol (4 professional dimensions: logical, rhetorical, structural, style), mapping section cascade effects, assessing venue fit across 6+ venues, detecting citation omissions from Semantic Scholar, and scaffolding rebuttal responses.

## Users

### Researcher (Primary)
- **Profile:** PhD student, postdoc, or independent researcher preparing a submission
- **Pain:** Spends 10–20 hours reviewing their own paper; repeats work when edits trigger cascade effects; unsure if paper suits the target venue
- **Goal:** Quick, structured feedback on multiple dimensions; confidence that revisions won't break downstream sections; venue comparison without manual checklist work

### Review Committee / Advisor (Secondary)
- **Profile:** Academic advisor or peer reviewer offering structured critique
- **Goal:** Consistent, repeatable feedback protocol applied across multiple papers

### Solo Authors (Tertiary)
- **Profile:** Independent researchers without institutional citation tracking
- **Goal:** Periodic "citation health checks" to detect omissions early

## Success Criteria

1. `review_paper` generates feedback on all 4 dimensions in <5 seconds for any paper section
2. `diff_audit` identifies all sections affected by changes with >85% precision within <3 seconds
3. `check_venue_fit` compares paper readiness across 6 venues within <2 seconds
4. `generate_rebuttal` parses reviewer comments and scaffolds responses within <1 second
5. `check_citations` scans Semantic Scholar for 50+ papers and flags omissions within <10 seconds
6. Review profiles reflect real academic standards (validated against published venue guidelines)
7. New venues and review profiles addable without code changes (YAML template system)

## Components

### MCP Tool: `scholaris` (unified router)

| Action | Tier | Purpose |
|--------|------|---------|
| `review_paper` | Free | 4-dimension review (logical, rhetorical, structural, style) |
| `check_venue_fit` | All 6 venues | Assess readiness across venues; rank by fit score; show gaps |
| `diff_audit` | Free | Map cascade effects after section revisions |
| `generate_rebuttal` | Free | Parse reviewer comments; scaffold point-by-point responses |
| `check_citations` | Free | Detect papers with vocabulary overlap not citing your work |

### Core Analyzers
- **section-parser:** Markdown heading-based extraction; robust to malformed/unsectioned text
- **claim-extractor:** Pulls 5 claim types (quantitative, directional, definitional, forward-ref, backward-ref); builds explicit dependency graph
- **semantic-section-graph:** TF-IDF vocabulary overlap; detects implicit coupling between sections
- **prohibition-scanner:** Pre-flight checks for anti-patterns and venue-specific disallowed phrasing
- **tfidf:** Vocabulary overlap scoring for venue fit and citation matching

### Registry System
- **loader.ts:** YAML file resolver; loads venue profiles and review profiles from `templates/`
- **renderer.ts:** Converts YAML data + analyzed sections into formatted review reports and venue fit tables


## External Systems

| System | Purpose |
|--------|---------|
| **Semantic Scholar API** | Citation omission detection; HTTP GET `/graph/v1/paper/search`; unauthenticated tier (100 req/min); upgradeable with free API key |
| **MCP SDK** | `@modelcontextprotocol/sdk` v1.6.1+; server transport and tool registration |
| **Claude Desktop** | Primary client integration; stdio transport |

## Roadmap

### Phase 1 — MVP (v0.1.0) ✅ Complete
- Unified MCP router (single tool, action dispatch)
- YAML template system for venues + review profiles
- All 5 actions implemented (`review_paper`, `check_venue_fit`, `diff_audit`, `generate_rebuttal`, `check_citations`)
- 80% test coverage

### Phase 2 — Venue Expansion (v0.2.0) 🔄 Planned
- Venue template contributions (EMNLP, CVPR, ICCV, ACL, ICLR)
- Custom review profile creation workflow (communities define their own dimensions)
- Prohibition patterns per venue

### Phase 3 — Intelligence & Hardening (v0.3.0) 🔄 Planned
- Multi-pass cascade detection (2nd-order effects)
- Author name disambiguation in citation matching
- Rate-limit optimization for Semantic Scholar (batch queries)
- Structured output (JSON in addition to markdown)

### Phase 4 — Researcher Workflows (v1.0.0+) 🔄 Future
- Revision tracking (diff view between submission versions)
- Venue recommendation engine (ML-based fit scoring from acceptance data)
- Integration with Overleaf / GitHub (watch for paper changes; auto-run checks)
