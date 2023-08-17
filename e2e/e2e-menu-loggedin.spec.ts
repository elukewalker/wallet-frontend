import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000/');
});

test('menu', async ({ page }) => {
  await page.getByRole('list').getByText('Credentials').click();
  await page.getByRole('list').getByText('History').click();
  await page.getByRole('list').getByText('Issuers').click();
  await page.getByText('Verifiers').first().click();
  await page.getByRole('img', { name: 'Logo' }).click();
  await page.getByRole('list').getByText('Logout').click();
});