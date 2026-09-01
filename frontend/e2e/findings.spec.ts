import { test, expect } from '@playwright/test';

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

/** Each test registers its own fresh org — findings created here never touch the seeded demo data. */
async function registerFreshUser(page: import('@playwright/test').Page) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Playwright Tester');
  await page.getByLabel('Email').fill(uniqueEmail('pw-findings'));
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/findings$/);
}

test('creating a finding (no Jira) shows it in the list and its own detail page', async ({ page }) => {
  await registerFreshUser(page);

  await page.getByRole('button', { name: 'Create Finding' }).first().click();
  await expect(page).toHaveURL(/\/findings\/new$/);
  await page.getByLabel('Title').fill('Stale Service Account: svc-playwright-test');
  await page.getByLabel('Description').fill('Created by an automated Playwright test.');
  await page.getByLabel('Severity').selectOption('critical');
  await page.getByRole('button', { name: 'Create Finding' }).click();

  await expect(page).toHaveURL(/\/findings\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Stale Service Account: svc-playwright-test' })).toBeVisible();
  await expect(page.getByText('critical')).toBeVisible();
  await expect(page.getByText('No Jira ticket linked to this finding yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Findings' }).click();
  await expect(page.getByText('Stale Service Account: svc-playwright-test')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible(); // no Jira connection for this fresh org
});

test('deleting a finding removes it from the list', async ({ page }) => {
  await registerFreshUser(page);

  await page.getByRole('button', { name: 'Create Finding' }).first().click();
  await page.getByLabel('Title').fill('Finding to delete');
  await page.getByLabel('Description').fill('This one gets deleted.');
  await page.getByRole('button', { name: 'Create Finding' }).click();
  await expect(page.getByRole('heading', { name: 'Finding to delete' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete finding' }).click();

  await expect(page).toHaveURL(/\/findings$/);
  await expect(page.getByText('No findings yet')).toBeVisible();
});

test('a hard refresh on the finding detail page still renders the SPA, not raw JSON', async ({ page }) => {
  // Regression test for a real bug: /findings/:id is both a frontend route and an API route
  // (see README -> Architecture). Only a real browser doing a real navigation can catch this —
  // Vitest/RTL never does a hard page load, so this is exactly what Playwright is for here.
  await registerFreshUser(page);
  await page.getByRole('button', { name: 'Create Finding' }).first().click();
  await page.getByLabel('Title').fill('Survives a hard refresh');
  await page.getByLabel('Description').fill('desc');
  await page.getByRole('button', { name: 'Create Finding' }).click();
  await expect(page).toHaveURL(/\/findings\/[0-9a-f-]+$/);
  const detailUrl = page.url();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Survives a hard refresh' })).toBeVisible();
  expect(page.url()).toBe(detailUrl);
});
