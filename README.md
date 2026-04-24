# scholaris-mcp

An MCP server for structured academic paper review and publication preparation.
Does what a professional reviewer would do: logical analysis, rhetorical assessment,
structural completeness, and venue-specific fit evaluation.

Solves the **cascade problem**: when you revise §Introduction, §Discussion may develop
new inconsistencies. `diff_audit` maps these dependencies automatically.

## Install

```bash
npm install -g scholaris-mcp
# or via npx (no install required)
```

## Configure in Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "scholaris": {
      "command": "npx",
      "args": ["-y", "scholaris-mcp"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "scholaris": {
      "command": "scholaris-mcp"
    }
  }
}
```

## Actions

All actions are invoked through the single `scholaris` MCP tool with an `action` parameter.

| Action | Tier | Description |
|---|---|---|
| `review_paper` | Free (structural + style) / Pro (all profiles) | Structured review protocol |
| `check_venue_fit` | Free (arxiv, acm, ieee) / Pro (all venues) | Venue readiness comparison |
| `diff_audit` | **Pro** | Cascade impact map after section revisions |
| `generate_rebuttal` | **Pro** | Rebuttal scaffold from reviewer comments |
| `check_citations` | **Pro** | Find papers that should cite you but don't |

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

### `check_citations` *(Pro)*
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

## Pricing

| Tier | Price | What's included |
|------|-------|-----------------|
| Free | Open source | `review_paper` (structural + style profiles), `check_venue_fit` (arxiv, acm, ieee) |
| Pro  | $15/mo | All actions (`diff_audit`, `generate_rebuttal`, `check_citations`), all profiles, all venues — set `SCHOLARIS_LICENSE_KEY` |

→ [Get a license key](https://forgeworkshop.dev/scholaris)

---

## Formats

**Venue templates** in `templates/venues/`: arxiv, ieee, acm, nature, neurips, icml

**Review profile templates** in `templates/review-profiles/`: logical, rhetorical, structural, style

Templates are YAML data files. Add new venues or profiles by following the schema
in [CLAUDE.md](CLAUDE.md) — no TypeScript changes required.

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

## Related

- [forgecraft-mcp](https://github.com/jghiringhelli/forgecraft-mcp): Project infrastructure generator for AI-assisted development
