import 'dotenv/config';

// Runs once per Jest worker, before any application module is imported — so getPool() and
// env.ts see these values from the very first call. Points at a dedicated *_test database
// (derived from DATABASE_URL / APP_DATABASE_URL) so e2e runs never touch dev/seed data. The
// identityhub_app role itself is cluster-wide (created once by db/init/01-create-app-role.sh),
// so it's already available here — only the database name needs to change.
const toTestDb = (url: string) => url.replace(/\/([^/?]+)(\?.*)?$/, '/$1_test$2');

const baseUrl = process.env.DATABASE_URL ?? 'postgresql://identityhub:identityhub@localhost:5432/identityhub';
process.env.DATABASE_URL = toTestDb(baseUrl);

const appBaseUrl =
  process.env.APP_DATABASE_URL ?? 'postgresql://identityhub_app:identityhub_app@localhost:5432/identityhub';
process.env.APP_DATABASE_URL = toTestDb(appBaseUrl);

process.env.JWT_SECRET ||= 'e2e-test-jwt-secret-not-for-production';
process.env.ENCRYPTION_KEY ||= '0'.repeat(64); // 32-byte hex
process.env.JIRA_CLIENT_ID ||= 'e2e-test-client-id';
process.env.JIRA_CLIENT_SECRET ||= 'e2e-test-client-secret';
process.env.JIRA_REDIRECT_URI ||= 'http://localhost:3000/api/jira/callback';
process.env.FRONTEND_ORIGIN ||= 'http://localhost:5173';
