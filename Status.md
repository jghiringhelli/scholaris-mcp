# Status

## Session 16 - 2026-11-12

### Summary
Public-facing cleanup. All actions and venues are now free: the Pro tier, the license key check and the purchase link were removed (the link returned 404 and the key check accepted any non-empty value). The README now says the package is not on npm, shows how to run from source, and documents all seven actions. The local web server binds to 127.0.0.1 only.

### State
- Build: clean (`tsc`). Tests: 215 passing.
- Not published on npm.

## Session 15 — 2026-03-24

### Summary
Forgecraft grade remediation: resolved all 4 audit failures (status staleness, CLAUDE.md CNT bloat, generate-rebuttal.ts length, project-specific.md bloat).

### Completed This Session
- Updated Status.md (session 15)
- Compressed CLAUDE.md to 3-line CNT sentinel
- Extracted `rebuttal-scaffold.ts` from `generate-rebuttal.ts` (305→~150 lines)
- Trimmed `project-specific.md` to ≤30 lines
- Forgecraft audit score: 69 → ≥90 (grade A)

### Previous Session (14) — 2025-07-14
- All config files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Shared infrastructure: `types.ts`, `errors/index.ts`, `logger/index.ts`
- Registry: `loader.ts` (YAML caching) + `renderer.ts` (markdown protocol rendering)
- Analyzers: `section-parser.ts` (markdown/LaTeX/numbered) + `claim-extractor.ts` (dependency graph + cascade solver)
- Tool handlers: `review-paper.ts`, `check-venue-fit.ts`, `diff-audit.ts`, `generate-rebuttal.ts`
- Router: `scholaris-router.ts` (unified Zod schema + dispatch)
- Entry point: `index.ts` (McpServer with StdioServerTransport)
- Venue templates: `arxiv.yaml`, `ieee.yaml`, `acm.yaml`, `neurips.yaml`, `icml.yaml`, `nature.yaml`
- Review profile templates: `logical-analysis.yaml`, `rhetorical.yaml`, `structural.yaml`, `style-tone.yaml`
- Tests: `section-parser.test.ts`, `claim-extractor.test.ts`, `loader.test.ts`, `review-paper.test.ts`, `check-venue-fit.test.ts`, `diff-audit.test.ts`, `generate-rebuttal.test.ts`
- GS artifacts: `CLAUDE.md`, `docs/adrs/ADR-0001.md`, `docs/adrs/ADR-0002.md`, `README.md`, `Status.md`
- `npm install` successful (208 packages)
- TypeScript clean compile (0 errors)
- 7 test files, **94 tests passing**
- Coverage: 83.98% stmts / 84.09% branches / 91.07% functions (all gates green)
- Initial git commit: `7cb8c86`
- `npm install` + `npx tsc --noEmit` (clean compile)
- Initial git commit

### Architecture Decisions
- ADR-0001: Unified MCP router (one tool, action dispatch) — same pattern as forgecraft-mcp
- ADR-0002: YAML templates for venue/profile knowledge (data not code)

### Next Session Priorities
- Run full test suite, fix any failures
- Evaluate actual review quality on a real paper section
- Consider adding EMNLP, CVPR, ICLR venue templates
- Consider `export_report` action to write review to a markdown file

### Known Issues / TODOs
- YAML templates are loaded without Zod schema validation (cast to type directly). Future: add Zod guards in loader.ts.
- `check-venue-fit.ts` uses structural heuristics (section keyword matching) as a proxy for real criteria evaluation. Real criteria evaluation would require the LLM to assess each criterion — out of scope for the scaffold.
- `generate-rebuttal.ts` reviewer comment parser uses line-based splitting — sophisticated multi-paragraph reviewer comments may not parse cleanly.
