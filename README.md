# scholaris-mcp

An MCP server for structured academic paper review and publication preparation.
Does what a professional reviewer would do: logical analysis, rhetorical assessment,
structural completeness, and venue-specific fit evaluation.

Solves the **cascade problem**: when you revise §Introduction, §Discussion may develop
new inconsistencies. `diff_audit` maps these dependencies automatically.

## Install

Scholaris is not published on npm. Run it from source (Node 18 or later):

```bash
git clone https://github.com/jghiringhelli/scholaris-mcp
cd scholaris-mcp
npm install
npm run build
```

## Configure in an MCP client (for example Claude Desktop)

Add to `claude_desktop_config.json`, using the absolute path to your clone:

```json
{
  "mcpServers": {
    "scholaris": {
      "command": "node",
      "args": ["/absolute/path/to/scholaris-mcp/dist/index.js"]
    }
  }
}
```

Everything is free and open source. There are no tiers, license keys or accounts.

## Actions

All actions are invoked through the single `scholaris` MCP tool with an `action` parameter.

| Action | Description |
|---|---|
| `review_paper` | Structured review protocol (logical, rhetorical, structural, style) |
| `check_venue_fit` | Venue readiness comparison across arxiv, ieee, acm, nature, neurips, icml |
| `diff_audit` | Cascade impact map after section revisions |
| `generate_rebuttal` | Rebuttal scaffold from reviewer comments |
| `check_citations` | Find papers that share your claims but do not cite you (Semantic Scholar) |
| `detect_plagiarism` | Compare a paper under investigation against your prior papers (topical TF-IDF and verbatim 5-gram overlap) |
| `compress_draft` | Flag redundant, misplaced or removable sections |

---

### `review_paper`
Structured review protocol using professional reviewer checklists.

```
scholaris(
  action: "review_paper",
  paper_text: "...",          # Full paper text (required)
  venue: "arxiv",             # Target venue (default: "general")
  profiles: ["logical", "rhetorical", "structural", "style"],  # All 4 profiles
  format: "actionable",       # "full" | "actionable" | "summary"
  section_focus: "Method"     # Optional: scope to one section
)
```

**Review profiles:**
| Profile | What it checks |
|---|---|
| `logical` | Logical fallacies, claim–evidence alignment, argument flow |
| `rhetorical` | Ethos/logos/pathos, cadence, abstract quality |
| `structural` | Section completeness, contribution–experiment alignment, figures/tables |
| `style` | Register consistency, hedging calibration, technical precision, sentence clarity |

---

### `check_venue_fit`
Compare paper readiness across multiple publication venues simultaneously.

```
scholaris(
  action: "check_venue_fit",
  paper_text: "...",
  venues: ["arxiv", "neurips", "icml"],  # Optional: omit for all 6 venues
  show_gaps: true
)
```

**Supported venues**: `arxiv`, `ieee`, `acm`, `nature`, `neurips`, `icml`

---

### `diff_audit`
Given a list of sections you just revised, find all other sections that need re-auditing
due to claim cascade effects.

```
scholaris(
  action: "diff_audit",
  paper_text: "...",
  changed_sections: ["Introduction", "Related Work"],  # Section headings you changed
  show_claims: true   # Also show the specific claims affected
)
```

The cascade solver extracts 5 claim types from each section:
- **quantitative** — numbers, percentages, metrics
- **directional** — comparative claims (X outperforms Y)
- **definitional** — We define / X is defined as
- **forward-ref** — See Section N
- **backward-ref** — As described in Section N

Propagates impact bidirectionally: sections that reference yours AND sections you reference.

---

### `generate_rebuttal`
Parse reviewer comments into structured points and scaffold a complete rebuttal.

```
scholaris(
  action: "generate_rebuttal",
  reviewer_comments: "Reviewer 1:\n1. ...\n2. ...",
  paper_title: "My Paper Title",    # Optional
  venue: "neurips",                 # Optional: venue context for tone
  tone: "collegial"                 # "formal" | "collegial" | "concise"
)
```

Output includes: opening statement → per-reviewer section → points sorted by severity
(major first) → ACK/CLARIFY/REVISE scaffold per point → Summary of Changes block.

---

### `check_citations`
Semantic citation protection for independent researchers.

Searches Semantic Scholar for recent papers that share your key claims but do not cite your work.
Designed for solo researchers without institutional monitoring services.

```
scholaris(
  action: "check_citations",
  paper_text: "...",
  paper_title: "Exact Title of Your Paper",
  claims: [                           # Optional: override auto-extraction
    "contrastive learning without negatives",
    "momentum encoder EMA update"
  ],
  published_after: "2022",            # Optional: filter to papers after this year
  max_results: 10                     # Default: 10, max: 20
)
```

Output includes: ranked omission table → high-priority details → papers already citing you.
Set `SEMANTIC_SCHOLAR_API_KEY` in the environment to raise the query rate limit.

---

### `detect_plagiarism`
Compare a paper under investigation against up to five of your own earlier papers.
Reports topical similarity (TF-IDF cosine) and verbatim similarity (word 5-gram Jaccard on sentence pairs).
It reports overlap, not intent: a human has to judge what the overlap means.

```
scholaris(
  action: "detect_plagiarism",
  source_paper_text: "...",           # or source_doi: "10.xxxx/..."
  reference_paper_texts: ["...", "..."],   # or reference_dois (max 5)
  similarity_threshold: 0.20          # Optional, 0.05 to 0.9
)
```

---

### `compress_draft`
Flags sections that repeat an earlier section, are disproportionately long, or sit in the wrong place.
Verdicts per section: `load-bearing`, `remove`, `compress`, `relocate`, `review`.

```
scholaris(
  action: "compress_draft",
  paper_text: "...",
  compression_mode: "moderate"        # "aggressive" | "moderate" | "light"
)
```

---

## Formats

**Venue templates** in `templates/venues/`: arxiv, ieee, acm, nature, neurips, icml

**Review profile templates** in `templates/review-profiles/`: logical, rhetorical, structural, style

Templates are YAML data files. Add new venues or profiles by following the schema
in [CLAUDE.md](CLAUDE.md) — no TypeScript changes required.

## Web UI (local)

`npm install --prefix packages/web && npm run web` serves a local page at http://localhost:3000. It listens on the loopback interface only and has no authentication.

## Development

```bash
npm install
npx tsc --noEmit          # type check
npx vitest run            # unit tests
npx vitest run --coverage  # with coverage report (80% gate)
```

## Architecture

```
src/index.ts              — MCP server entry point
src/tools/                — Tool handlers (one per action)
src/registry/             — YAML loader + markdown renderer
src/analyzers/            — Pure functions: section parsing, claim extraction
src/shared/               — Types, errors, logger
templates/                — YAML data files (venues + review profiles)
tests/                    — Test files mirroring src/ structure
docs/adrs/                — Architecture Decision Records
```

See [docs/adrs/](docs/adrs/) for architectural decisions.
