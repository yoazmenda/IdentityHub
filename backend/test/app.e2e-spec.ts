import './setup-env';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { ValidationFailedException, toValidationDetails } from '../src/common/validation.exception';
import { JiraService } from '../src/services/jira.service';
import { JiraConnectionsDao } from '../src/dao/jira-connections.dao';
import { getPool, getAppPool, withTenant, closePool } from '../src/config/database';
import { ensureTestDatabase, truncateAll } from './test-db';
import { FakeJiraService } from './fakes/fake-jira.service';
import * as blogDigestJob from '../src/jobs/blog-digest.job';

jest.mock('../src/jobs/blog-digest.job');

const fakeJiraService = new FakeJiraService(new JiraConnectionsDao());

async function seedActiveJiraConnection(pool: Pool, organizationId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO jira_connections
       (organization_id, site_url, cloud_id, access_token, refresh_token, token_expires_at, status, connected_by_user_id)
     VALUES ($1, 'https://acme-test.atlassian.net', 'cloud-1', 'enc', 'enc', NOW() + interval '1 hour', 'active', $2)`,
    [organizationId, userId],
  );
}

describe('IdentityHub e2e', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    await ensureTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JiraService)
      .useValue(fakeJiraService)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors) => new ValidationFailedException(toValidationDetails(errors)),
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    pool = getPool();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    jest.clearAllMocks();
    fakeJiraService.createIssue.mockResolvedValue({ key: 'TST-1', url: 'https://acme-test.atlassian.net/browse/TST-1' });
    jest.mocked(blogDigestJob.fetchLatestPost).mockResolvedValue({
      url: 'https://oasis.security/blog/some-post',
      title: 'Some Security Post',
      excerpt: 'An excerpt of the post.',
    });
    jest.mocked(blogDigestJob.fetchPostBody).mockResolvedValue('Full body of the post.');
    jest.mocked(blogDigestJob.summarize).mockResolvedValue('A short AI summary.');
  });

  const server = () => app.getHttpServer();

  async function registerUser(email: string, name = 'Test User') {
    const res = await request(server())
      .post('/api/auth/register')
      .send({ email, password: 'password123', name });
    return { token: res.body.token as string, userId: res.body.user.id as string };
  }

  describe('Auth', () => {
    it('registers, then rejects a duplicate email with 409', async () => {
      const res1 = await request(server())
        .post('/api/auth/register')
        .send({ email: 'dup@example.com', password: 'password123', name: 'First' });
      expect(res1.status).toBe(201);
      expect(res1.body.token).toBeDefined();

      const res2 = await request(server())
        .post('/api/auth/register')
        .send({ email: 'dup@example.com', password: 'password123', name: 'Second' });
      expect(res2.status).toBe(409);
      expect(res2.body).toEqual({ error: expect.stringContaining('already exists') });
    });

    it('rejects invalid registration input with field-level details', async () => {
      const res = await request(server())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short', name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' }),
          expect.objectContaining({ field: 'name' }),
        ]),
      );
    });

    it('rejects a wrong password without revealing the real error to the client beyond a generic message', async () => {
      await registerUser('bob@example.com');
      const res = await request(server())
        .post('/api/auth/login')
        .send({ email: 'bob@example.com', password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid email or password' });
    });

    it('logout immediately invalidates the JWT — a subsequent request with the same token 401s', async () => {
      const { token } = await registerUser('carol@example.com');

      const before = await request(server()).get('/api/findings').set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      const logout = await request(server()).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
      expect(logout.status).toBe(204);

      const after = await request(server()).get('/api/findings').set('Authorization', `Bearer ${token}`);
      expect(after.status).toBe(401);
    });

    it('rejects requests with no Authorization header', async () => {
      const res = await request(server()).get('/api/findings');
      expect(res.status).toBe(401);
    });
  });

  describe('Findings + full lifecycle (create finding -> create Jira ticket -> verify in recent tickets)', () => {
    it('runs the full lifecycle end to end', async () => {
      const { token, userId } = await registerUser('dana@example.com');
      const meRes = await request(server()).get('/api/findings').set('Authorization', `Bearer ${token}`);
      // organization_id isn't directly exposed by /findings when empty; fetch it via a finding creation instead.
      expect(meRes.status).toBe(200);
      expect(meRes.body).toEqual([]);

      const created = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Stale key', description: 'Unused 90 days', severity: 'high' });
      expect(created.status).toBe(201);
      expect(created.body.jira_ticket).toBeNull();
      const findingId = created.body.id as string;
      const organizationId = created.body.organization_id as string;

      await seedActiveJiraConnection(pool, organizationId, userId);

      const ticketRes = await request(server())
        .post(`/api/findings/${findingId}/jira-ticket`)
        .set('Authorization', `Bearer ${token}`)
        .send({ project_key: 'TST', issue_type_id: '10001' });
      expect(ticketRes.status).toBe(201);
      expect(ticketRes.body.jira_issue_key).toBe('TST-1');
      expect(fakeJiraService.createIssue).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ projectKey: 'TST', issueTypeId: '10001' }),
      );

      const detail = await request(server())
        .get(`/api/findings/${findingId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.body.jira_ticket.jira_issue_key).toBe('TST-1');

      const recent = await request(server())
        .get('/api/jira-tickets')
        .query({ project_key: 'TST', limit: 10 })
        .set('Authorization', `Bearer ${token}`);
      expect(recent.status).toBe(200);
      expect(recent.body.tickets).toHaveLength(1);
      expect(recent.body.tickets[0].jira_issue_key).toBe('TST-1');

      const list = await request(server()).get('/api/findings').set('Authorization', `Bearer ${token}`);
      expect(list.body[0].jira_ticket.jira_issue_key).toBe('TST-1');
    });

    it('409s creating a second ticket for a finding that already has one', async () => {
      const { token, userId } = await registerUser('erin@example.com');
      const created = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Finding', description: 'desc', severity: 'low' });
      const organizationId = created.body.organization_id as string;
      await seedActiveJiraConnection(pool, organizationId, userId);

      await request(server())
        .post(`/api/findings/${created.body.id}/jira-ticket`)
        .set('Authorization', `Bearer ${token}`)
        .send({ project_key: 'TST', issue_type_id: '1' });

      const second = await request(server())
        .post(`/api/findings/${created.body.id}/jira-ticket`)
        .set('Authorization', `Bearer ${token}`)
        .send({ project_key: 'TST', issue_type_id: '1' });

      expect(second.status).toBe(409);
      expect(second.body.error).toContain('already has a linked Jira ticket');
    });

    it('404s creating a ticket when Jira is not connected for the org', async () => {
      const { token } = await registerUser('frank@example.com');
      const created = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Finding', description: 'desc', severity: 'low' });

      const res = await request(server())
        .post(`/api/findings/${created.body.id}/jira-ticket`)
        .set('Authorization', `Bearer ${token}`)
        .send({ project_key: 'TST', issue_type_id: '1' });

      expect(res.status).toBe(404);
    });

    it('rejects an invalid severity with a field-level validation error', async () => {
      const { token } = await registerUser('grace@example.com');
      const res = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', description: 'Y', severity: 'catastrophic' });

      expect(res.status).toBe(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'severity' })]),
      );
    });

    it('400s (not 500) for a syntactically invalid finding id', async () => {
      const { token } = await registerUser('henry@example.com');
      const res = await request(server())
        .get('/api/findings/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: expect.any(String) });
    });
  });

  describe('Multi-tenancy', () => {
    it('a user from Org A cannot see, fetch, update, or delete Org B data', async () => {
      const orgA = await registerUser('orga@example.com');
      const orgB = await registerUser('orgb@example.com');

      const finding = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({ title: 'Org A secret finding', description: 'desc', severity: 'critical' });
      const findingId = finding.body.id as string;

      const listAsB = await request(server()).get('/api/findings').set('Authorization', `Bearer ${orgB.token}`);
      expect(listAsB.body).toEqual([]);

      const getAsB = await request(server())
        .get(`/api/findings/${findingId}`)
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(getAsB.status).toBe(404);

      const updateAsB = await request(server())
        .put(`/api/findings/${findingId}`)
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ status: 'resolved' });
      expect(updateAsB.status).toBe(404);

      const deleteAsB = await request(server())
        .delete(`/api/findings/${findingId}`)
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(deleteAsB.status).toBe(404);

      // and the finding is untouched, visible to its actual owner
      const getAsA = await request(server())
        .get(`/api/findings/${findingId}`)
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(getAsA.status).toBe(200);
    });
  });

  describe('External API (API key auth)', () => {
    it('rejects requests with no API key, and with an invalid one', async () => {
      const noKey = await request(server()).get('/api/v1/findings');
      expect(noKey.status).toBe(401);

      const badKey = await request(server()).get('/api/v1/findings').set('X-API-Key', 'not-a-real-key');
      expect(badKey.status).toBe(401);
    });

    it('accepts a valid key, creates a finding attributed to no user, and scopes it to the right org', async () => {
      const { token } = await registerUser('ivan@example.com');

      const keyRes = await request(server())
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'CI pipeline' });
      expect(keyRes.status).toBe(201);
      const plainKey = keyRes.body.key as string;
      expect(plainKey).toMatch(/^ihk_/);

      const createRes = await request(server())
        .post('/api/v1/findings')
        .set('X-API-Key', plainKey)
        .send({ title: 'Scanner finding', description: 'from CI', severity: 'medium' });
      expect(createRes.status).toBe(201);

      // visible via the web session for the same org...
      const listAsUser = await request(server()).get('/api/findings').set('Authorization', `Bearer ${token}`);
      expect(listAsUser.body.some((f: { title: string }) => f.title === 'Scanner finding')).toBe(true);

      // ...and a revoked key stops working immediately
      const revoke = await request(server())
        .delete(`/api/api-keys/${keyRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(revoke.status).toBe(204);

      const afterRevoke = await request(server()).get('/api/v1/findings').set('X-API-Key', plainKey);
      expect(afterRevoke.status).toBe(401);
    });

    it('rejects invalid input on the external API the same way as the web API', async () => {
      const { token } = await registerUser('julia@example.com');
      const keyRes = await request(server())
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'CI pipeline' });

      const res = await request(server())
        .post('/api/v1/findings')
        .set('X-API-Key', keyRes.body.key)
        .send({ title: '', description: 'x', severity: 'medium' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('Jira Integration (mocked Atlassian API — see test/fakes/fake-jira.service.ts)', () => {
    it('starts disconnected', async () => {
      const { token } = await registerUser('kim@example.com');
      const res = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: false });
    });

    it('runs the full OAuth round trip: connect -> callback -> status -> projects -> issue types -> disconnect', async () => {
      const { token } = await registerUser('liam@example.com');

      // Step 1: frontend calls /connect with its Bearer token, gets back the authorize URL.
      const connectRes = await request(server()).get('/api/jira/connect').set('Authorization', `Bearer ${token}`);
      expect(connectRes.status).toBe(200);
      const authorizeUrl = new URL(connectRes.body.url);
      expect(authorizeUrl.hostname).toBe('auth.atlassian.test');
      const state = authorizeUrl.searchParams.get('state')!;
      expect(state).toBeTruthy();

      // Step 2: Atlassian redirects the browser back with that same state + a code.
      const callbackRes = await request(server()).get('/api/jira/callback').query({ code: 'fake-auth-code', state });
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.location).toContain('jira_connected=1');

      // Step 3: connection now shows as active.
      const statusRes = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${token}`);
      expect(statusRes.body).toEqual(
        expect.objectContaining({ connected: true, status: 'active', site_url: 'https://acme-test.atlassian.net' }),
      );

      // Step 4/5: dynamic project + issue-type fetching now works.
      const projectsRes = await request(server()).get('/api/jira/projects').set('Authorization', `Bearer ${token}`);
      expect(projectsRes.status).toBe(200);
      expect(projectsRes.body).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'TST' })]));

      const issueTypesRes = await request(server())
        .get('/api/jira/projects/TST/issue-types')
        .set('Authorization', `Bearer ${token}`);
      expect(issueTypesRes.status).toBe(200);
      expect(issueTypesRes.body).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Task' })]));

      // Step 6: disconnect revokes it.
      const disconnectRes = await request(server()).delete('/api/jira/connection').set('Authorization', `Bearer ${token}`);
      expect(disconnectRes.status).toBe(204);

      const afterDisconnect = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${token}`);
      expect(afterDisconnect.body.connected).toBe(false);
      expect(afterDisconnect.body.status).toBe('revoked');
    });

    it('redirects with an error, and connects nothing, when the state does not match a pending flow', async () => {
      const res = await request(server()).get('/api/jira/callback').query({ code: 'whatever', state: 'never-issued' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('jira_error=');
    });

    it('redirects with an error when the token exchange itself fails', async () => {
      const { token } = await registerUser('mia@example.com');
      const connectRes = await request(server()).get('/api/jira/connect').set('Authorization', `Bearer ${token}`);
      const state = new URL(connectRes.body.url).searchParams.get('state')!;

      const res = await request(server()).get('/api/jira/callback').query({ code: 'invalid-code', state });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('jira_error=');

      const statusRes = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${token}`);
      expect(statusRes.body.connected).toBe(false);
    });

    it('404s fetching projects when Jira is not connected', async () => {
      const { token } = await registerUser('noah@example.com');
      const res = await request(server()).get('/api/jira/projects').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('connecting Jira for Org A does not connect it for Org B', async () => {
      const orgA = await registerUser('orga-jira@example.com');
      const orgB = await registerUser('orgb-jira@example.com');

      const connectRes = await request(server()).get('/api/jira/connect').set('Authorization', `Bearer ${orgA.token}`);
      const state = new URL(connectRes.body.url).searchParams.get('state')!;
      await request(server()).get('/api/jira/callback').query({ code: 'fake-code', state });

      const statusA = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${orgA.token}`);
      expect(statusA.body.connected).toBe(true);

      const statusB = await request(server()).get('/api/jira/status').set('Authorization', `Bearer ${orgB.token}`);
      expect(statusB.body.connected).toBe(false);
    });
  });

  describe('Automations (NHI Blog Digest)', () => {
    it('auto-provisions a disabled automation on first list, with no runs yet', async () => {
      const { token } = await registerUser('oscar@example.com');
      const res = await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual(
        expect.objectContaining({ type: 'blog_digest', enabled: false, schedule: 'manual', runs: [] }),
      );
    });

    it('rejects an invalid schedule value', async () => {
      const { token } = await registerUser('penny@example.com');
      const [automation] = (await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`)).body;

      const res = await request(server())
        .put(`/api/automations/${automation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ schedule: 'every-fortnight' });

      expect(res.status).toBe(400);
    });

    it('400s "Run now" when no project/issue type is configured yet', async () => {
      const { token } = await registerUser('quinn@example.com');
      const [automation] = (await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`)).body;

      const res = await request(server())
        .post(`/api/automations/${automation.id}/run`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('404s "Run now" when Jira is not connected, and records the failure in run history', async () => {
      const { token } = await registerUser('riley@example.com');
      const [automation] = (await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`)).body;

      await request(server())
        .put(`/api/automations/${automation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ project_key: 'KAN', issue_type_id: '10001' });

      const runRes = await request(server())
        .post(`/api/automations/${automation.id}/run`)
        .set('Authorization', `Bearer ${token}`);
      expect(runRes.status).toBe(404);

      const listRes = await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`);
      expect(listRes.body[0].runs).toHaveLength(1);
      expect(listRes.body[0].runs[0].status).toBe('failed');
    });

    it('runs end to end: configure -> connect Jira -> run now -> creates a ticket -> appears in run history', async () => {
      const { token, userId } = await registerUser('sam@example.com');
      const [automation] = (await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`)).body;
      const organizationId = (
        await request(server())
          .post('/api/findings')
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'tmp', description: 'tmp', severity: 'low' })
      ).body.organization_id as string;
      await seedActiveJiraConnection(pool, organizationId, userId);

      await request(server())
        .put(`/api/automations/${automation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true, schedule: 'daily', project_key: 'KAN', issue_type_id: '10001' });

      const runRes = await request(server())
        .post(`/api/automations/${automation.id}/run`)
        .set('Authorization', `Bearer ${token}`);

      expect(runRes.status).toBe(201);
      expect(runRes.body.status).toBe('success');
      expect(runRes.body.run.jira_ticket_url).toBe('https://acme-test.atlassian.net/browse/TST-1');

      const listRes = await request(server()).get('/api/automations').set('Authorization', `Bearer ${token}`);
      expect(listRes.body[0].last_processed_url).toBe('https://oasis.security/blog/some-post');
      expect(listRes.body[0].runs[0].status).toBe('success');

      // Running again immediately skips — same post, no duplicate ticket.
      fakeJiraService.createIssue.mockClear();
      const secondRun = await request(server())
        .post(`/api/automations/${automation.id}/run`)
        .set('Authorization', `Bearer ${token}`);
      expect(secondRun.body.status).toBe('skipped');
      expect(fakeJiraService.createIssue).not.toHaveBeenCalled();
    });

    it('scopes automations per org — Org A configuring/running theirs never touches Org B’s row', async () => {
      const orgA = await registerUser('orga-auto@example.com');
      const orgB = await registerUser('orgb-auto@example.com');

      const [autoA] = (await request(server()).get('/api/automations').set('Authorization', `Bearer ${orgA.token}`)).body;
      await request(server())
        .put(`/api/automations/${autoA.id}`)
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({ enabled: true });

      const listB = await request(server()).get('/api/automations').set('Authorization', `Bearer ${orgB.token}`);
      expect(listB.body[0].enabled).toBe(false);

      // Org B can't reach into Org A's automation by id either.
      const crossOrgUpdate = await request(server())
        .put(`/api/automations/${autoA.id}`)
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ enabled: true });
      expect(crossOrgUpdate.status).toBe(404);
    });
  });

  describe('Row-Level Security (defense in depth — see backend/src/config/database.ts:withTenant)', () => {
    it('a query with no WHERE clause at all still can\'t see another tenant\'s rows', async () => {
      const orgA = await registerUser('rls-a@example.com');
      const orgB = await registerUser('rls-b@example.com');
      const findingA = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${orgA.token}`)
        .send({ title: 'Org A only', description: 'desc', severity: 'low' });
      const findingB = await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ title: 'Org B only', description: 'desc', severity: 'low' });
      expect(findingA.status).toBe(201);
      expect(findingB.status).toBe(201);
      const organizationIdA = findingA.body.organization_id as string;

      // Simulates exactly the bug class RLS exists to catch: application code that forgot its
      // own organization_id filter. Even so, scoped to Org A, it sees only Org A's row.
      const { rows } = await withTenant(organizationIdA, (client) =>
        client.query('SELECT title, organization_id FROM findings'),
      );
      expect(rows.every((r) => r.organization_id === organizationIdA)).toBe(true);
      expect(rows.some((r) => r.title === 'Org B only')).toBe(false);
      expect(rows.some((r) => r.title === 'Org A only')).toBe(true);
    });

    it('default-denies on the app connection when no tenant context is set at all', async () => {
      const { token } = await registerUser('rls-c@example.com');
      await request(server())
        .post('/api/findings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Should stay invisible', description: 'desc', severity: 'low' });

      // A raw query on the identityhub_app connection that never calls withTenant/set_config —
      // the policy itself denies by default, not just "we remembered to scope this query".
      const client = await getAppPool().connect();
      try {
        const { rows } = await client.query('SELECT * FROM findings');
        expect(rows).toEqual([]);
      } finally {
        client.release();
      }
    });
  });
});
