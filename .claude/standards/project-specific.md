# Project-Specific Rules

## Purpose
Scholaris: structured academic paper reviewer (logical fallacies, rhetorical assessment,
structural completeness, venue fit). `diff_audit` solves the cascade problem — section
revisions propagate through the dependency graph automatically.

## Architecture
```
index.ts → scholaris-router.ts → tools/ → registry/ + analyzers/
analyzers/ are pure functions. shared/ has no feature imports. templates/ are YAML data only.
```

## Layer Rules
- Tool handlers → registry + analyzers only. No business logic in handlers.
- Analyzers: no I/O, no imports from registry or tools. `shared/` imports nothing above it.

## The Four Actions
| Action | Purpose |
|---|---|
| `review_paper` | Venue + profile templates → structured review checklist |
| `check_venue_fit` | Score paper readiness across multiple venues |
| `diff_audit` | Propagate changed-section impact through the dependency graph |
| `generate_rebuttal` | Parse reviewer comments → ACK/CLARIFY/REVISE scaffold |

See `docs/TechSpec.md` for YAML schemas and extension guides.

### Learned Corrections
- [AI assistant appends corrections here with date and description]
