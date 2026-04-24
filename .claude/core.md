# scholaris-mcp — Core

> Always loaded. Contains only what is true across all domains.
> Hard limit: 50 lines. If it grows, move the excess to a domain node.

## Domain Identity
Solves the **cascade problem**: when you revise §Introduction, §Discussion may develop new inconsistencies. ``` scholaris(   action: "check_venue_fit",   paper_text: "...",   venues: ["arxiv", "n

## Tags
[UNIVERSAL] [CLI] [API]

## Primary Entities
- ```
- src/index.ts              — MCP server entry point
- src/tools/                — Tool handlers (one per action)
- src/registry/             — YAML loader + markdown renderer
- src/analyzers/            — Pure functions: section parsing, claim extraction
- src/shared/               — Types, errors, logger
- templates/                — YAML data files (venues + review profiles)
- tests/                    — Test files mirroring src/ structure

## Layer Map
```
[API/CLI] → [Services] → [Domain] → [Repositories] → [Infrastructure]
Dependencies point inward. Domain has zero external imports.
```

## Invariants
- Every public function has a JSDoc with typed params and returns
- No circular imports (enforced by pre-commit hook)
- Test coverage ≥80% on all changed files