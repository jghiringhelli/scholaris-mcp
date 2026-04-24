<!-- ForgeCraft sentinel: api | 2026-04-20 | npx forgecraft-mcp refresh . --apply to update -->

## CLI Standards

### User Experience
- Clear, concise help text for every command and option.
- Consistent flag naming: --verbose, --output, --format across all commands.
- Exit codes: 0 for success, 1 for general error, 2 for usage error.
- Colored output for terminals that support it, plain text fallback.
- Progress indicators for long-running operations.

### Input/Output
- Accept input from stdin, arguments, and config files.
- Support --json flag for machine-readable output.
- Support --quiet flag to suppress non-essential output.
- Never prompt for input in non-interactive mode (CI/CD).

### Distribution
- Single binary or npx-invocable package.
- Minimal dependencies — fast install.
- Version command: --version prints version and exits.

### Error Messages
- Errors include: what went wrong, why, and how to fix it.
- Suggest the correct command when user mistypes.
- Link to documentation for complex errors.

## API Standards

### Contract First
- Define OpenAPI/JSON Schema spec before implementing endpoints.
- Generate types from spec — don't manually duplicate.
- Spec is the source of truth. Implementation must match.

### Design Rules
- Version from day one: /api/v1/...
- Proper HTTP semantics: GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes.
- Pagination on ALL list endpoints. Never return unbounded results.
- Consistent response envelope: { data, meta, errors }.
- Async operations return job ID + polling endpoint, not blocking results.
- Rate limiting on all public endpoints.

### Validation
- Input validation at API boundary — reject malformed requests before they reach services.
- Use schema validation (Pydantic, Zod, Joi) not manual if-checks.
- Validate request body, query params, path params, and headers.
- Return 422 with specific field errors, not generic 400.

### Authentication & Authorization
- Auth middleware/guards at router level, not checked inside handlers.
- Role-based or policy-based access control via decorators/middleware.
- Never trust client-sent user identity — always verify from token/session.

### Database & Migrations
- Schema changes managed through migration files (Prisma Migrate, Knex, Flyway, Alembic).
- Every migration must be reversible (up + down). Test rollbacks.
- Never modify a deployed migration — create a new one.
- Seed data separate from migrations. Test seeds run in CI.

### Security (OWASP Top 10)
- **Injection**: Parameterized queries only. No string concatenation for SQL, commands, or LDAP.
- **Broken Auth**: Rate-limit login attempts. Enforce strong passwords. Rotate tokens.
- **Sensitive Data Exposure**: Encrypt at rest (AES-256). Never log PII, tokens, or passwords.
- **XXE/XSS**: Sanitize all user-generated HTML. Content-Security-Policy headers on all responses.
- **Broken Access Control**: Enforce ownership checks — users can't access other users' resources.
- **Security Misconfiguration**: No default credentials. No verbose error messages in production.
  Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- **CSRF**: Token-based protection on all state-changing endpoints (unless using SameSite cookies + bearer tokens).
- **Audit logging**: Log WHO did WHAT, WHEN, to WHICH resource. Separate from application logs.
  Immutable. Retained per compliance requirements.

### Graceful Shutdown
- Handle SIGTERM: stop accepting new requests, drain in-flight requests, close DB connections, exit.
- Kubernetes: readiness probe fails immediately, liveness continues during drain.
- Shutdown timeout configurable (default: 30s). Force exit after timeout.

## API Stack Constraints — Approved Dependency Choices

These are the **approved libraries for this API project**.
Every choice has a banned alternative with a concrete reason.
If you reach for a banned alternative, stop and use the approved one instead.
Rationale is stated so you understand the constraint — not so you can argue around it.


### TypeScript API — Required Packages

| Concern | Use | Do NOT use | Reason |
|---|---|---|---|
| **Password hashing** | `argon2@^0.31` | `bcrypt`, `bcryptjs` | `bcrypt` requires a native module (`@mapbox/node-pre-gyp`) that pulls in an old `tar` CVE chain. `argon2` is pure JS, faster, OWASP-preferred. |
| **HTTP framework** | `express@^4` or `fastify@^4` | `restify`, `hapi@<21`, `koa` alone | `restify` is unmaintained. `hapi` is fine at `^21+` only. |
| **Input validation** | `zod@^3` | `joi` alone, `express-validator` alone | `zod` infers TypeScript types natively — no separate type declaration needed. |
| **JWT** | `jsonwebtoken@^9` | `jwt-simple` (abandoned), `jsonwebtoken@<9` | Security fixes landed in v9. `jwt-simple` has no active maintainer. |
| **ORM / query builder** | `@prisma/client@^5` or `kysely@^0.27` | `typeorm`, `sequelize` | `typeorm` uses decorators (not type-safe), slow migrations. `sequelize` has weak TypeScript support. |
| **Logger** | `pino@^9` | `winston` alone, `console.log` in prod | `pino` is 5–10× faster than `winston` and outputs structured JSON natively. `console.log` is not structured. |
| **HTTP client (outbound)** | `undici@^6` or native `fetch` (Node 18+) | `axios` for Node ≥18 | Native `fetch` is available; `axios` adds bundle weight and a dependency surface for a built-in feature. |
| **ESLint** | `@typescript-eslint/eslint-plugin@^8` | `@typescript-eslint@^5` or `^6` | `^6` has a known CVE via old `minimatch` transitive dep. `^8` is the current stable. |

**npm audit policy**: `npm audit` must return zero `high` or `critical` findings before the
first commit. If a dependency introduces a high/critical CVE, replace it with an alternative
from this table or open an ADR documenting the exception with mitigation.

## API Deployment

### Container-Based (Production)
- Multi-stage Dockerfile: builder stage (install + compile) → runtime stage (minimal image, non-root).
- Pin base image digests, not just tags. Scan images for CVEs in CI (Trivy, Grype).
- Push to container registry (ECR, GCR, GHCR) on every merge to main.
- Orchestrate with Kubernetes, ECS, or Cloud Run. Define resource limits for every container.

### PaaS / Quick Deploy
- **Railway**: Git-push deploy with auto-detected Dockerfile or Nixpacks. Ideal for staging and side projects.
- **Render**: Free tier + auto-deploy from Git. Native cron jobs, managed Postgres.
- **Fly.io**: Edge deployment with Firecracker VMs. Good for low-latency APIs. `fly deploy` from CI.
- All PaaS platforms: use platform env vars for secrets, connect managed DB add-ons, enable auto-sleep
  for non-production to control cost.

### Environment Management
- One Dockerfile, many environments. Same image runs in dev, staging, prod.
- Health check endpoint (`/health`) returns: status, version, uptime, dependency connectivity.
- Database connection pooling configured per environment (dev: 5, staging: 20, prod: 50+).
- Migrations run automatically on deploy (pre-deploy hook or init container). Never manually.

## API-Specific Testing Requirements

### Contract / Consumer-Driven Contract (CDC) — Mandatory
CDC is not optional for API projects. The consumer writes the pact file; the provider verifies it in CI before deployment. API breakage that passes all provider-side tests but fails consumers is the exact class of defect CDC prevents.
- Use Pact or Spring Cloud Contract.
- Pact broker (self-hosted or pactflow.io) stores pact files and verification results.
- Provider verification runs in CI on every build — a failed verification blocks deployment.
- CDC covers request schema, response schema, status codes, and error shapes. It does not cover load or security — those are separate gates.

### API / Subcutaneous Tests as Primary Integration Layer
The subcutaneous layer (HTTP requests to a running server with real DB and stubbed external deps) is the primary integration verification surface for API projects. Unit tests verify logic; subcutaneous tests verify contracts.
- Use Supertest (Node) or httpx/pytest (Python) against a locally started server instance.
- Stub external services with WireMock, msw, or responses (Python). Never call real external APIs in CI.
- Every public endpoint has a subcutaneous test for: 200 happy path, 4xx validation rejection, 401/403 auth enforcement, and at least one edge case.

### DAST at Staging — Mandatory
Dynamic application security testing is required before every production promotion. OWASP ZAP minimum.
- Run ZAP active scan against the staging environment as a post-deploy CI step.
- Define an acceptable risk threshold in the spec: which finding severities are blocking (High = always blocking; Medium/Low = tracked, not blocking by default).
- ZAP scan configuration committed to the repo (`zap-config.yaml`). Not a one-off manual step.

### Rate Limiting and Throttling in Integration Layer
- Rate limit behavior must be covered in the subcutaneous integration suite, not just documented.
- Test: normal traffic (no throttle), burst traffic (trigger rate limit, receive 429), retry-after header present and correct.
- Test quota exhaustion and quota reset behavior for API-key-based limits.


### Scaling
- Horizontal scaling by default. No in-memory session state — use Redis or DB.
- Auto-scaling rules based on CPU + request queue depth, not just CPU alone.
- Database read replicas for read-heavy workloads. Connection pooler (PgBouncer) in front of Postgres.

## API Smoke Testing

### Required: Playwright APIRequestContext (no browser overhead)
Tag all smoke tests `@smoke` for isolated execution:
```
npx playwright test --config playwright.smoke.config.ts --grep @smoke
```

Minimum smoke suite for every API:
- **Health check**: `GET /health` → 200, body includes `status: ok` and `version`
- **Auth**: primary login endpoint with valid credentials → token returned
- **Primary read**: one representative `GET` → 200, response envelope validates
- **Primary write**: one representative `POST` → 2xx, verify with follow-up `GET`
- **404 shape**: non-existent resource → 404, error envelope matches spec contract

```typescript
// tests/smoke/api.smoke.ts
import { test, expect } from '@playwright/test';

test('@smoke health check', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toMatchObject({ status: 'ok' });
});

test('@smoke auth returns token', async ({ request }) => {
  const res = await request.post('/api/v1/auth/login', {
    data: {
      email: process.env['SMOKE_USER'],
      password: process.env['SMOKE_PASSWORD'],
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.token ?? body.data?.token).toBe('string');
});
```

```typescript
// playwright.smoke.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: { baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000' },
  testMatch: '**/*.smoke.ts',
  retries: 1,
  timeout: 10_000,
});
```

Smoke tests run against the **deployed staging URL** only (`PLAYWRIGHT_BASE_URL` env var).
They never run against localhost in CI — that is the integration suite's job.

CI integration (post-deploy step):
```yaml
- name: Smoke Tests
  run: npx playwright test --config playwright.smoke.config.ts
  env:
    PLAYWRIGHT_BASE_URL: ${{env.STAGING_URL}}
    SMOKE_USER: ${{secrets.SMOKE_USER}}
    SMOKE_PASSWORD: ${{secrets.SMOKE_PASSWORD}}
```

## Library / Package Standards

### Public API
- Clear, minimal public API surface. Export only what consumers need.
- Barrel file (index.ts / __init__.py) defines the public API explicitly.
- Internal modules prefixed with underscore or in internal/ directory.
- Every public API has JSDoc/docstring with examples.

### Versioning & Compatibility
- Semantic versioning: MAJOR.MINOR.PATCH.
- MAJOR: breaking API changes. MINOR: new features, backward compatible. PATCH: bug fixes.
- CHANGELOG.md maintained with every release.
- Deprecation warnings before removal (minimum 1 minor version).

### Distribution
- Package includes only dist/ and necessary runtime files.
- Types included (declaration files for TypeScript).
- Peer dependencies used for framework integrations.
- Minimize runtime dependencies — every dep is a risk.

### Testing
- Test against the public API, not internals.
- Test with multiple versions of peer dependencies.
- Integration tests simulate real consumer usage patterns.

### Documentation
- README with: install, quick start, API reference, examples.
- Usage examples for every major feature.
- Migration guide for every major version bump.
