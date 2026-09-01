import { defineConfig, devices } from '@playwright/test';

// Runs against the actual dev stack (frontend + real backend + real Postgres), the same way
// the app was manually verified during development — not a mocked/isolated frontend build.
// Flows that require the real Atlassian OAuth exchange stay out of this automated suite (that
// needs a live user login and can't run headless in CI); everything else that's reachable
// without Jira actually being connected is covered here.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests share one backend/DB; keep them sequential to avoid cross-test interference
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
