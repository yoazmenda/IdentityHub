import { test, expect } from '@playwright/test';

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test('a fresh org sees the blog digest automation, disabled, with a Connect Jira hint', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Playwright Tester');
  await page.getByLabel('Email').fill(uniqueEmail('pw-automations'));
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/findings$/);

  await page.getByRole('link', { name: 'Automations' }).click();

  await expect(page.getByRole('heading', { name: 'NHI Blog Digest' })).toBeVisible();
  await expect(page.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
  await expect(page.getByText('Connect Jira in')).toBeVisible();
  await expect(page.getByText('No runs yet')).toBeVisible();
});
