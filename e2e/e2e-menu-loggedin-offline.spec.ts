import { test, expect } from '@playwright/test';

test('offline menu', async ({ page, context }) => {
	await page.goto('http://localhost:3000/');
  await page.getByRole('list').getByText('Credentials').click();
  await page.getByRole('list').getByText('History').click();
  await page.getByRole('list').getByText('Issuers').click();
  await page.getByText('Verifiers').first().click();
  await page.getByRole('img', { name: 'Logo' }).click();
	await context.setOffline(true);
	//await page.getByRole('list').getByText('Credentials').click(); // opens service worker dialog
  await page.getByRole('list').getByText('History').click();
  await page.getByRole('list').getByText('Issuers').click();
  await page.getByText('Verifiers').first().click();
  await page.getByRole('img', { name: 'Logo' }).click();
  await page.getByRole('list').getByText('Logout').click();
});