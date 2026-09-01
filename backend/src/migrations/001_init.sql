-- IdentityHub schema. See README.md -> Database Schema for column-level rationale.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_organization_id ON users(organization_id);

-- Backs real logout: a JWT's jti must have a live row here, so deleting the row revokes the token.
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_findings_organization_id ON findings(organization_id);

-- One row per org (README -> One Jira Connection Per Org).
CREATE TABLE jira_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id),
  site_url VARCHAR(500) NOT NULL,
  cloud_id VARCHAR(255) NOT NULL,
  access_token TEXT NOT NULL, -- encrypted at rest, see common/crypto.util.ts
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  connected_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jira_connections_organization_id ON jira_connections(organization_id);

-- Local ledger of tickets created from findings. Recent Tickets reads this, never the Jira API.
CREATE TABLE jira_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id),
  jira_connection_id UUID NOT NULL REFERENCES jira_connections(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  jira_issue_key VARCHAR(50) NOT NULL,
  jira_project_key VARCHAR(20) NOT NULL,
  jira_url VARCHAR(500) NOT NULL,
  title VARCHAR(500) NOT NULL,
  created_by_user_id UUID REFERENCES users(id), -- NULL when created via the external API
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jira_tickets_organization_id ON jira_tickets(organization_id);
CREATE INDEX idx_jira_tickets_finding_id ON jira_tickets(finding_id);
CREATE INDEX idx_jira_tickets_project_key ON jira_tickets(organization_id, jira_project_key);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  key_hash VARCHAR(255) NOT NULL, -- SHA-256; plaintext key is shown once and never stored
  label VARCHAR(255) NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- Product-level scheduled/manual jobs (currently just the bonus NHI Blog Digest). One row per
-- org per type, auto-provisioned (disabled) the first time GET /api/automations runs for that org.
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  type VARCHAR(50) NOT NULL, -- 'blog_digest' today; a discriminator so a second type needs no schema change
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (schedule IN ('manual', 'hourly', 'daily', 'weekly')),
  config JSONB NOT NULL DEFAULT '{}', -- e.g. {"project_key": "KAN", "issue_type_id": "10001"}
  last_processed_url VARCHAR(1000), -- blog_digest dedup marker
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, type)
);
CREATE INDEX idx_automations_organization_id ON automations(organization_id);

-- Run history. Not linked into jira_tickets — that table's finding_id is NOT NULL by design,
-- and a blog digest ticket isn't a finding, so it gets its own ledger instead.
CREATE TABLE automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES automations(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'skipped', 'failed')),
  summary VARCHAR(1000) NOT NULL,
  jira_ticket_url VARCHAR(500),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_automation_runs_automation_id ON automation_runs(automation_id, started_at DESC);

-- Row-Level Security: a second, DB-enforced layer of tenant isolation on top of the app-level
-- `WHERE organization_id = $X` in every DAO query. identityhub_app (created once by
-- db/init/01-create-app-role.sh, granted below) never owns these tables, so RLS always applies
-- to it — even a query that forgets its WHERE clause still can't cross tenants. See README ->
-- Multi-Tenancy.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations, users, sessions, findings, jira_connections, jira_tickets, api_keys, automations, automation_runs
TO identityhub_app;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions', 'findings', 'jira_connections', 'jira_tickets', 'automations', 'automation_runs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- NULLIF guards against current_setting() returning '' (not NULL) for a custom GUC that
    -- was touched earlier on a reused pooled connection and has since gone out of scope —
    -- without it, casting '' to uuid errors instead of gracefully denying.
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;

-- users and api_keys are NOT RLS-scoped: their auth-resolution queries (find a user by email,
-- find an API key by hash) run before any org is known — that lookup is what establishes the
-- org, so it can't be pre-scoped to one. Those two queries run on the unrestricted admin
-- connection; every other query against these tables already filters by organization_id in
-- application SQL.
