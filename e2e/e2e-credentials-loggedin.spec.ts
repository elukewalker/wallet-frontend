import { test, expect } from '@playwright/test';

test('credentials', async ({ page }) => {
	await page.goto('http://localhost:3000/');
  await page.getByRole('list').getByText('Credentials').click();
  await page.getByRole('img', { name: 'National VID Issuer' }).click();
  await page.getByRole('img', { name: 'http://wallet-enterprise-vid-issuer:8003/images/vidCard.png' }).click();
  await page.getByRole('button').click();
  await page.getByRole('list').getByText('Credentials').click();
  await page.getByRole('img', { name: 'University of Athens' }).first().click();
  await page.getByRole('img', { name: 'http://wallet-enterprise-diploma-issuer:8000/images/EuropassUoaCard.png' }).click();
  await page.getByRole('button').click();
  await page.getByRole('list').getByText('Credentials').click();
  await page.getByRole('img', { name: 'University of Athens' }).nth(1).click();
  await page.getByRole('img', { name: 'http://wallet-enterprise-diploma-issuer:8000/images/EuropassUoaCard.png' }).click();
  await page.getByRole('button').click();
  await page.getByRole('list').getByText('Credentials').click();
});