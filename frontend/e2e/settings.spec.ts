import { test, expect } from '@playwright/test';

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

async function registerFreshUser(page: import('@playwright/test').Page) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Playwright Tester');
  await page.getByLabel('Email').fill(uniqueEmail('pw-settings'));
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/findings$/);
}

test('a fresh org starts with Jira disconnected and no API keys', async ({ page }) => {
  await registerFreshUser(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await expect(page.getByText('Not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: /connect to jira/i })).toBeVisible();
  await expect(page.getByText('No API keys yet. Generate one to use the external API.')).toBeVisible();
});

test('generating an API key reveals it once, then it appears in the list', async ({ page }) => {
  await registerFreshUser(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await page.getByRole('button', { name: /generate new key/i }).click();
  await page.getByLabel('Label').fill('Playwright CI key');
  await page.getByRole('button', { name: 'Generate' }).click();

  const revealedKey = page.locator('code', { hasText: 'ihk_' });
  await expect(revealedKey).toBeVisible();
  const keyText = await revealedKey.textContent();
  expect(keyText).toMatch(/^ihk_/);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Playwright CI key')).toBeVisible();
  // The plaintext key is never shown again, even in the list.
  await expect(page.getByText(keyText!)).not.toBeVisible();
});

test('a generated key actually authenticates the external API, and stops working once revoked', async ({
  page,
  request,
}) => {
  await registerFreshUser(page);
  await page.getByRole('link', { name: 'Settings' }).click();

  await page.getByRole('button', { name: /generate new key/i }).click();
  await page.getByLabel('Label').fill('Live external API key');
  await page.getByRole('button', { name: 'Generate' }).click();
  const apiKey = await page.locator('code', { hasText: 'ihk_' }).textContent();
  await page.getByRole('button', { name: 'Done' }).click();

  const baseURL = page.url().replace(/\/settings.*$/, '');
  const listRes = await request.get(`${baseURL}/api/v1/findings`, { headers: { 'X-API-Key': apiKey! } });
  expect(listRes.status()).toBe(200);

  page.once('dialog', (dialog) => dialog.accept());
  const revokeResponse = page.waitForResponse(
    (res) => res.request().method() === 'DELETE' && res.url().includes('/api/api-keys/'),
  );
  await page.getByRole('button', { name: 'Revoke Live external API key' }).click();
  await revokeResponse;

  const afterRevoke = await request.get(`${baseURL}/api/v1/findings`, { headers: { 'X-API-Key': apiKey! } });
  expect(afterRevoke.status()).toBe(401);
});
