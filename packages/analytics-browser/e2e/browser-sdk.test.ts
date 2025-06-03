import { test, expect } from '@playwright/test';

test('browser SDK page loads correctly', async ({ page }) => {
  await page.goto('/browser-sdk/index.html');
  const title = await page.title();
  expect(title).toBeTruthy();
});
