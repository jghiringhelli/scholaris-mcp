# Status

## Session 14 — 2025-07-14

### Summary
Initial scaffold for `scholaris-mcp` completed in full.

### Completed This Session
- Project structure created at `c:\workspace\claude\scholaris-mcp`
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
