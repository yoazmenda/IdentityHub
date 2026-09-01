import { test, expect } from '@playwright/test';

// Each run uses a fresh, unique email so registering doesn't collide with a previous run's data.
function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`;
}

test('registering creates a fresh, isolated org and lands on an empty findings list', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Playwright Tester');
  await page.getByLabel('Email').fill(uniqueEmail('pw-register'));
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/findings$/);
  await expect(page.getByText('No findings yet')).toBeVisible();
});

test('logout ends the session — findings redirects back to login', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('jane@acme.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/findings$/);

  await page.getByRole('button', { name: /jane/i }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/findings');
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong password shows an inline error and does not navigate away', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('john@acme.com');
  await page.getByLabel('Password').fill('the-wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByText('Invalid email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
