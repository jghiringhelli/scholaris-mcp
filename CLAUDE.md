# CLAUDE.md

## Project Identity
- **Project**: scholaris-mcp
- **Primary Language**: TypeScript 5 · Node 18+
- **Framework**: @modelcontextprotocol/sdk
- **Domain**: MCP Server — Academic paper review and publication preparation tool
- **Package**: scholaris-mcp (npm)
- **Sibling project**: forgecraft-mcp (project infrastructure generator)

## Purpose
Scholaris is a structured academic paper reviewer designed to do what a professional
reviewer would do: logical fallacy detection, argumentative analysis, rhetorical
assessment, structural completeness checks, and venue-specific fit evaluation.
It solves the cascade problem — when you revise §Introduction, §Discussion may
develop new inconsistencies. `diff_audit` maps these dependencies automatically.

## Architecture

```
MCP Tool Handler (src/index.ts)       ← Single McpServer, registers `scholaris` tool
Router (src/tools/scholaris-router.ts) ← Zod schema + action dispatch. No business logic.
Tool Handlers (src/tools/)             ← One file per action. Thin. Delegates to analyzers/registry.
Registry (src/registry/)               ← YAML loading (loader.ts) + markdown rendering (renderer.ts)
Analyzers (src/analyzers/)             ← section-parser.ts + claim-extractor.ts (pure functions)
Shared (src/shared/)                   ← types, errors, logger
Templates (templates/**)               ← YAML data files. Never imported as code.
```

### The Four Actions
| Action | Purpose |
|---|---|
| `review_paper` | Load venue + review profile templates, parse paper, render structured checklist |
| `check_venue_fit` | Score paper readiness against multiple venues simultaneously |
| `diff_audit` | Given changed sections, propagate impact through the dependency graph |
| `generate_rebuttal` | Parse reviewer comments, classify by severity, scaffold ACK/CLARIFY/REVISE |

## Layer Rules
- Tool handlers → registry + analyzers only. No business logic in handlers.
- Registry never imports from tools/.
- Analyzers are pure functions — no I/O, no imports from registry or tools.
- `shared/` has zero imports from any feature layer.
- Templates are pure YAML data — never imported as TypeScript modules.

## Template Schema Contracts

### Venue Profile (templates/venues/*.yaml)
```
id: string           (VenueId enum value)
name: string
category: string
required_sections: string[]
optional_sections: string[]
formatting: { max_pages?, max_words_main?, anonymous, double_blind, citation_style }
criteria: Array<{ id, description, severity: critical|high|medium|low, check_in: string[] }>
rejection_patterns: string[]
submission_notes: string
```

### Review Profile (templates/review-profiles/*.yaml)
```
id: string           (ReviewProfileId enum value)
name: string
description: string
dimensions: Array<{
  id: string
  title: string
  description: string
  prompts: string[]
  severity_guide: { critical, high, medium }
}>
report_format: { per_section: boolean, include_quotes: boolean, remediation: boolean }
```

## The Cascade Problem (diff_audit)
When you revise a section, two classes of sections become suspect:
1. **Forward dependents** — sections that cite, reference, or build on the changed section
2. **Reverse dependents** — sections that the changed section explicitly cites or references

`claim-extractor.ts` builds a dependency graph from 5 claim types extracted by regex:
- `quantitative` — numerical values, percentages, metrics
- `directional` — comparative claims (X outperforms Y)
- `definitional` — We define / X is defined as
- `forward-ref` — See Section N / Results in Section N
- `backward-ref` — As described in Section N / Building on Section N

`findAffectedSections()` propagates impact bidirectionally.

## Code Standards
- Maximum function length: 50 lines. Split at 50.
- Maximum file length: 300 lines. Split by responsibility.
- Every exported function has JSDoc with typed params and returns.
- No hardcoded strings outside template YAML files.
- Error types: one hierarchy in `src/shared/errors/`. Never throw raw Error.
- Logger: JSON-lines to stderr only. Never console.log in production code.
- Tests: tests/ mirrors src/ structure. Test files are `*.test.ts`.

## Adding a New Venue
1. Create `templates/venues/<id>.yaml` following the venue schema above.
2. Add the id to the `VenueId` union in `src/shared/types.ts`.
3. Add to the Zod enum in `src/tools/scholaris-router.ts`.
4. Add tests in `tests/registry/loader.test.ts`.

## Adding a New Review Profile
1. Create `templates/review-profiles/<id>.yaml` following the review profile schema.
2. Add the id to the `ReviewProfileId` union in `src/shared/types.ts`.
3. Add to the Zod enum in `src/tools/scholaris-router.ts` (profiles param).
4. Add tests in `tests/registry/loader.test.ts`.

## Commit Protocol
- Conventional commits: feat|fix|refactor|docs|test|chore(scope): description
- Every commit must pass: `npx tsc --noEmit` + `npx vitest run --coverage`
- Coverage gates: 80% line/statement/function, 70% branch.

## Corrections Log
### Learned Corrections
- [AI assistant appends corrections here with date and description]
