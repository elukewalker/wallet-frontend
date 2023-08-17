import { test as setup, expect } from '@playwright/test';
import { STORAGE_STATE } from '../playwright.config';

setup('do login', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.goto('http://localhost:3000/login');
  await page.getByPlaceholder('Enter your username').click();
  await page.getByPlaceholder('Enter your username').fill(process.env.USERNAME);
  await page.getByPlaceholder('Enter your password').click();
  await page.getByPlaceholder('Enter your password').fill(process.env.PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
	await page.waitForURL('http://localhost:3000/');
  await expect(page.getByRole('heading', {name: 'Credentials'})).toBeVisible();
	await page.context().storageState({path: STORAGE_STATE});
});