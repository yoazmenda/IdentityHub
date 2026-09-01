# CLAUDE.md

Guidance for whoever (human or Claude) works on this repo. `README.md` covers the product spec, API, schema, and design decisions — this file is about conventions and how the codebase is put together. Don't duplicate README content here; link to it.

## Current State

Feature-complete for this submission: auth with real server-side session revocation, tenant-scoped findings CRUD, API keys, real Jira OAuth (verified against a live Atlassian site), findings ↔ Jira tickets, recent tickets, and the bonus Automations feature (NHI Blog Digest — verified live, filed real tickets). 165 automated tests (155 via the two `docker compose run` test commands, plus 10 Playwright e2e), all green on a fresh `docker compose up -d --build`.

If picking this back up: `docker compose up -d --build` (migrations + demo seed run automatically, see `backend/docker-entrypoint.sh`), then the backend/frontend unit and e2e commands in README → Quick Start confirm nothing regressed before you change anything. No `make` in this repo by design — plain `docker compose` only, per submission requirements. Tenant scoping is enforced at the DAO signature level (every method takes `organizationId`) plus by the two auth guards — no separate tenant middleware exists or is needed.

## Key Conventions

- **No ORM.** All SQL in `dao/*.ts`, raw `pg`, always parameterized. Never string-interpolate a query.
- **Every tenant-scoped DAO method requires `organizationId`** as a parameter — baked into the signature, not left to the caller to remember.
- **Controller → Service → DAO, one direction.** Controllers: HTTP concerns only. Services: business logic, shared by `controllers/web/*` and `controllers/api/*`. No controller talks to a DAO directly.
- **Two auth guards**, one shape: `jwt-auth.guard.ts` and `api-key-auth.guard.ts` both resolve to `{ organizationId, userId? }` so services don't care which one authenticated the caller.
- DTOs with `class-validator` on every request body — see README → Input Validation for the exact error shape.
- Errors always `{ "error": string }` or the validation-details shape — never leak stack traces or raw DB errors.
- Secrets only from `process.env` (loaded via `.env`), never hardcoded in source, never logged. `.env` itself is committed (see its own header comment) with local-dev-only values for the JWT/encryption/DB-role secrets; the Jira OAuth client secret and OpenAI key are real secrets and ship blank, never committed filled in.
- One migration file (`backend/src/migrations/001_init.sql`) — this is a finished POC, not a system with deployment history, so keep the schema in one file rather than splitting into a change log.
- Frontend: one typed API client module per resource under `src/api/`, never scattered `fetch()` calls in components.

## UI / Design Direction

Modern SaaS aesthetic (Linear/Vercel/Retool register), desktop only — no responsive/mobile effort.

- Fixed left sidebar (Findings, Recent Tickets, Automations, Settings) + top bar + content area.
- One accent color, generous whitespace, consistent spacing/type scale.
- **One of each shared component** — Button, Badge, Modal, form field, table style — reused everywhere, not reinvented per screen. Tailwind + Radix UI + lucide-react icons.
- Severity badges: critical/high/medium/low each get a distinct, consistent color everywhere severity appears.
- Empty/loading/error states are designed, not afterthoughts — real content and a next step (e.g. "Connect Jira in Settings"), not a bare spinner or error string.
- Screen content lives in README → Features; this section governs how it should look.

## Testing & Verification

Coverage and conventions are in README → Testing — unit (backend + frontend), backend e2e (incl. RLS), all run via plain `docker compose run --rm <service> npm ...`, and a real Playwright e2e suite (`frontend/e2e/`) that runs on the host against the live stack (see README for the exact commands and why). Playwright MCP (`.mcp.json`) is separate — an interactive browser used during development (e.g. the real Jira OAuth exchange), not part of the automated suite.

## Jira Sandbox

Use a free Atlassian Cloud site for real OAuth testing — don't mock the Jira API for the core flow; both "architectural knowledge" and "security practices" grading depend on a real OAuth 2.0 exchange, not a stub. (The e2e test suite mocks Atlassian's API — see `test/fakes/fake-jira.service.ts` — that's a separate concern from manual/live verification.)
