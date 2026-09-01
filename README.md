# IdentityHub — NHI Management Platform

A proof-of-concept Jira integration for a Non-Human Identity (NHI) management platform: report NHI findings (stale service accounts, overprivileged keys, expiring credentials) as Jira tickets, from the UI or a REST API for scanners/CI pipelines.

## Quick Start

Requires Docker (with Compose).

```bash
git clone https://github.com/yoazmenda/IdentityHub
cd IdentityHub
docker compose up -d --build
```

`.env` is committed with local-dev default values (see its header comment). Migrations and demo-data seeding run on backend startup — both are idempotent, so this is safe to re-run.

- Frontend: **http://localhost:5173**
- API: **http://localhost:3000/api**
- Demo login: **john@acme.com** / **password123** (a second org, `bob@globex.com` / `password123`, demonstrates tenant isolation)

Auth, findings, and the external API all work immediately. **To use the Jira integration**, register an OAuth 2.0 (3LO) app at [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps/) (callback URL `http://localhost:3000/api/jira/callback`, scopes `read:jira-work write:jira-work read:jira-user offline_access`), then fill in `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET` in `.env` and restart (`docker compose restart backend`). Then "Connect to Jira" in Settings.

| Command | Description |
|---|---|
| `docker compose up -d --build` | Start (or update) everything — builds, migrates, seeds, runs |
| `docker compose down` / `down -v` | Stop everything / stop and wipe the database too |
| `docker compose logs -f` | Tail all service logs |
| `docker compose run --rm backend npm test` | Backend unit tests |
| `docker compose run --rm frontend npm test` | Frontend unit tests |
| `docker compose run --rm backend npm run test:e2e` | Backend e2e tests (spins up a disposable test DB) |

---

## Features

- **Auth & sessions** — register/login/logout with real server-side session revocation (a JWT alone isn't enough to authenticate; see [Design Decisions](#design-decisions--assumptions)). Multi-tenant: each org's data is fully isolated.
- **Findings** — create, view, edit, delete NHI findings (title, description, severity, status). List and detail pages, with a **Jira Ticket** column/section showing the linked ticket or a "Create ticket" action.
- **Jira integration** — real OAuth 2.0 (3LO) connection per org; create a ticket from a finding (either inline while creating the finding, or later from its detail page), with Project and Issue Type fetched live from Jira.
- **Recent Tickets** — the 10 most recent tickets filed from IdentityHub for a selected project, read from a local ledger (no Jira API call).
- **Automations** — background jobs IdentityHub runs on your behalf. Currently one: **NHI Blog Digest** (the assignment's bonus challenge) — fetches the latest [oasis.security/blog](https://oasis.security/blog) post, summarizes it with an LLM, and files a Jira ticket. Configurable (enabled, schedule, target project) with a real in-process scheduler and visible run history, not just a script someone has to remember to run.
- **External REST API** — API-key authenticated endpoints for scanners/CI to create findings and Jira tickets programmatically. Keys are generated/revoked from Settings.
- **Settings** — Jira connection status/connect/disconnect, API key management.

Desktop only (no responsive/mobile layout in scope).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript, React (Vite), Tailwind CSS, Radix UI |
| Backend | TypeScript, NestJS |
| Database | PostgreSQL, no ORM (raw parameterized SQL via `pg`) |
| Auth | JWT + server-side sessions (app), OAuth 2.0 (Jira) |
| Testing | Jest + Supertest (backend), Vitest + React Testing Library (frontend) |

---

## Architecture

```
backend/src/
├── controllers/web/     # JWT-auth controllers (UI)
├── controllers/api/     # API-key-auth controllers (external, /api/v1/*)
├── services/            # Business logic, shared by both controller layers
├── dao/                 # Raw SQL, one class per table — no ORM
├── dto/                 # class-validator request bodies
├── middleware/           # The two auth guards + their param decorators
├── common/               # Exception filter, encryption, shared pipes
├── jobs/                 # Scheduled tasks (session cleanup, automations)
├── migrations/           # One .sql file + a tiny runner
└── seed/                 # Demo data

frontend/src/
├── pages/    # One file per route
├── components/  # Shared UI kit: Button, Badge, Modal, FormField, table/empty/error states
├── api/      # Thin typed client per resource — the only place fetch() is called
└── hooks/    # Auth context
```

**Key rules:**
- **No ORM** — every DAO method that touches a tenant-scoped table requires `organizationId` as a parameter, baked into the query. Not optional, not left to the caller to remember.
- **Controller → Service → DAO**, one direction. Controllers only do HTTP concerns; both controller layers call the same services.
- **Two auth guards**, one shape — `JwtAuthGuard` and `ApiKeyAuthGuard` both resolve to `{ organizationId, userId? }`, so services never know which one authenticated the caller.
- **Every backend route lives under `/api`** — the frontend's own routes (e.g. `/findings/:id`, a page) never do, so a hard refresh can't collide with the API route of the same shape.

---

## Database Schema

Every table carries `organization_id` except `organizations` itself — it *is* the tenant; every other table's `organization_id` is a foreign key to its `id`. One migration file: `backend/src/migrations/001_init.sql`.

Tenant isolation is enforced **twice** — app-level (`WHERE organization_id = $1`, required on every DAO method) and DB-level (Postgres Row-Level Security, so even a query that forgets that `WHERE` still can't cross tenants; see `Security` below). `users` and `api_keys` get the app-level layer only, not RLS — their auth-resolution queries (find a user by email, an API key by hash) are what *establish* which org a request belongs to, so they structurally can't be pre-filtered to an org that isn't known yet. Every other tenant table gets both layers.

| Table | Purpose |
|---|---|
| `organizations`, `users` | Tenants and their users |
| `sessions` | Backs real logout — a JWT's `jti` claim must have a live, unexpired row here |
| `findings` | The core NHI finding record |
| `jira_connections` | One OAuth connection per org; tokens AES-256-GCM encrypted at rest |
| `jira_tickets` | Local ledger of tickets created from findings — Recent Tickets reads this, never the Jira API. `finding_id` is `NOT NULL`: every row here represents a ticket sourced from an actual finding |
| `api_keys` | SHA-256 hashed; plaintext shown once at creation |
| `automations`, `automation_runs` | Bonus feature config + run history (see Features) |

Full column definitions are in the migration file itself — it's short and worth reading directly rather than duplicated here.

---

## REST API

All web endpoints (`/api/*`) require `Authorization: Bearer <JWT>`. External endpoints (`/api/v1/*`) require `X-API-Key: <key>` instead — same request/response shapes either way.

#### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register — creates a new org with you as its first user (no invite flow in this POC) |
| POST | `/api/auth/login` | Returns `{ token, user }` |
| POST | `/api/auth/logout` | Deletes the server-side session row — the JWT stops working immediately |

#### Findings
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/findings` | List, each with its linked `jira_ticket` (or `null`) |
| GET / PUT / DELETE | `/api/findings/:id` | Get / update / delete one |
| POST | `/api/findings` | Create — optionally with `jira: { project_key, issue_type_id }` to file a ticket in the same call (atomic: if the Jira call fails, the finding is rolled back) |

```json
// POST /api/findings
{ "title": "Stale Service Account: svc-deploy-prod", "description": "...", "severity": "high" }

// same call, also filing a ticket:
{ "title": "...", "description": "...", "severity": "high", "jira": { "project_key": "KAN", "issue_type_id": "10001" } }
```

#### Jira Tickets & Integration
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/findings/:id/jira-ticket` | File a ticket for an existing finding — `409` if it already has one |
| GET | `/api/jira-tickets?project_key=KAN&limit=10` | Recent tickets from the local ledger. `project_key` required on the web UI (per spec), optional on the external API |
| GET | `/api/jira/connect` | Returns `{ url }` (JSON, not a 302) — a plain `<a href>` can't carry a Bearer token, so the frontend fetches this authenticated, then navigates itself |
| GET | `/api/jira/callback` | OAuth callback |
| GET | `/api/jira/status` · DELETE `/api/jira/connection` | Connection status / disconnect |
| GET | `/api/jira/projects` · `/api/jira/projects/:key/issue-types` | Dynamic dropdowns |

#### API Keys & Automations
| Method | Endpoint | Description |
|---|---|---|
| GET / POST / DELETE | `/api/api-keys` | List / generate (plaintext shown once) / revoke |
| GET | `/api/automations` | Auto-provisions the `blog_digest` automation on first call, with its 10 most recent runs |
| PUT | `/api/automations/:id` | Update `enabled`, `schedule`, `project_key`, `issue_type_id` |
| POST | `/api/automations/:id/run` | Run now — same code path the hourly scheduler tick uses |

#### External API
| Method | Endpoint |
|---|---|
| GET / POST | `/api/v1/findings` |
| GET | `/api/v1/findings/:id` |
| POST | `/api/v1/findings/:id/jira-ticket` |

#### Input Validation & Error Shape

Every write endpoint validates via `class-validator` DTOs before it reaches business logic.

```json
// 400 — validation failure
{ "error": "Validation failed", "details": [{ "field": "severity", "message": "must be one of: critical, high, medium, low" }] }
```

- `400` — malformed input (including a non-UUID `:id`)
- `404` — not found, **or** it belongs to another org (existence of other tenants' data is never revealed via `403`)
- `409` — valid input, business-rule conflict (e.g. finding already has a ticket)
- `401` — missing/invalid `Authorization` or `X-API-Key`

---

## Jira Ticket Creation

`POST /rest/api/3/issue` is called with exactly four fields:

| Field | Source |
|---|---|
| `project.key`, `issuetype.id` | User-selected dropdowns, fetched live from Jira (issue types depend on the chosen project, so they're fetched after) |
| `summary` | Finding title, editable — the only field Jira itself always requires |
| `description` | Finding description, editable, sent as Atlassian Document Format |

**Excluded on purpose**: *Priority* (hideable per-project — a failure mode for no real benefit over severity, which already communicates urgency), *Assignee* (needs a user-picker component), *Labels/Components/Custom fields* (project-specific, would mean rebuilding Jira's own create screen). Reporter is set automatically by Jira to the OAuth token owner.

---

## Design Decisions & Assumptions

Judgment calls made where the assignment left room for interpretation:

- **Session management**: a plain JWT can't be revoked, so sessions are tracked server-side (`sessions` table, `jti` claim) — logout deletes the row, invalidating the token immediately even though it hasn't expired.
- **Registration creates a new org** each time (no invite flow) — this is what makes the multi-tenancy story self-serve to demo: sign up twice, get two isolated orgs.
- **Two paths to a Jira ticket** — inline during finding creation, or later from the finding's detail page — matching how a human triaging findings and an automated scanner would each want to work.
- **One Jira connection per org**, and **no bidirectional sync back from Jira** — both are explicit v1 scope cuts; see `jira_connections`/`jira_tickets` schema comments.
- **Recent Tickets is scoped to one project** (dropdown, defaults to the first available) and reads the local ledger, never the Jira API — per the spec's "from the selected project" wording, and to keep the page fast/available even if Jira is down.
- **API Keys panel in Settings**: the external API requires a key, but no screen for issuing one is otherwise specified — this panel is the assumed source (list, generate with one-time reveal, revoke).
- **Automations (bonus feature) don't appear in Recent Tickets** — `jira_tickets.finding_id` is `NOT NULL` by design (every row there is a ticket sourced from an actual finding), and a blog post isn't one. The Automations page has its own run history instead, which is arguably the more correct home for it anyway.
- **Findings are the primary unit of work** — no grouping into higher-level "issues." A reasonable next step, out of scope here.
- **Multi-tenancy is enforced twice**: every DAO query takes `organizationId` as a required parameter (app-level `WHERE organization_id = $1`), and Postgres Row-Level Security policies enforce the same boundary at the database layer as defense-in-depth — see `backend/src/config/database.ts` (`withTenant`) and `Security` below. `organization_id` always comes from the authenticated session/API key, never from the URL or request body.

---

## Testing

- **Backend unit** (`backend/src/**/*.spec.ts`) — services (mocked DAOs), both auth guards, and web/external controllers (mocked services, real `ValidationPipe`/`HttpExceptionFilter`, driven with supertest for real status codes).
- **Backend e2e** (`backend/test/app.e2e-spec.ts`) — the real `AppModule` against a real, disposable Postgres database. Covers the full lifecycle (register → create finding → file ticket → verify in recent tickets), multi-tenancy, Row-Level Security (queries run as the least-privilege `identityhub_app` role — a missing/wrong `WHERE` clause still can't leak cross-tenant rows), API key auth, validation/error shapes, and a full **mocked-Atlassian OAuth round trip** (connect → callback → status → dynamic dropdowns → disconnect, plus the error paths) via `test/fakes/fake-jira.service.ts` — it mocks only the boundary that would otherwise call the real Atlassian API; `jira_connections` reads/writes go through the real DAO.
- **Frontend unit** (`frontend/src/**/*.spec.tsx`, Vitest + RTL) — shared components and every page, including their empty/loading/error states and Jira-disconnected states.
- **Frontend e2e** (`frontend/e2e/*.spec.ts`, real Playwright against the live docker-compose stack) — full-browser regression coverage a unit test can't give: register → create finding → create Jira ticket, delete, a hard page refresh on `/findings/:id` (the frontend-route/API-route collision described in `Architecture`), login/logout, API key generation and revocation actually authenticating/rejecting real HTTP calls, and the Automations empty state.

DAOs aren't unit-tested in isolation (they're thin SQL wrappers) — the e2e suite exercises them against a real database instead.

```bash
docker compose run --rm backend npm test              # backend unit tests
docker compose run --rm frontend npm test              # frontend unit tests
docker compose run --rm backend npm run test:e2e       # backend e2e tests (incl. RLS)

# Frontend Playwright e2e — runs on the host, not in Docker (headless Chromium isn't reliable
# in the plain Alpine frontend image); requires the stack already up (`docker compose up -d`)
# and Node on the host:
cd frontend && npm install && npx playwright install chromium --with-deps && npm run test:e2e
```

---

## Security

- **Tenant isolation, twice**: every DAO query requires `organizationId` (app-level filter), and every tenant table except `users`/`api_keys` (see `Database Schema`) also carries a Postgres Row-Level Security policy enforced by a separate least-privilege DB role (`identityhub_app`, non-owner so RLS can't be bypassed) — a bug in a single query can no longer leak another org's rows.
- **Jira connection health is checked on every call**, not just proactively by token expiry: a 401/403 from Jira (revoked access, deleted site) marks the connection `expired` immediately so the UI reflects reality on the next load, instead of the request just failing once and the app quietly staying "connected."
- **Jira tokens** AES-256-GCM encrypted at rest, key from `ENCRYPTION_KEY`
- **API keys** SHA-256 hashed, plaintext shown once
- **Passwords** bcrypt hashed
- **Sessions** short-lived JWTs (15 min) backed by a revocable server-side session table
- **No ORM** — raw SQL, always parameterized, never string-interpolated

---

## Out of Scope

Documented but intentionally not built: findings→issues grouping, bidirectional Jira sync, a Priority/Assignee field on tickets, multiple Jira connections per org, a provider-agnostic integration layer (GitHub Issues, Linear, etc.).
