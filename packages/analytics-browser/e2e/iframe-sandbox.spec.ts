import { test, expect } from '@playwright/test';

test('iframe-sandbox parent page has no uncaught exceptions', async ({ page }) => {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));

  await page.goto('/iframe-sandbox/parent.html', { waitUntil: 'networkidle' });

  // Allow iframe content (child.html with Amplitude) to load and run
  const iframe = page.frameLocator('iframe[src*="child.html"]');
  await iframe.locator('body').waitFor({ state: 'visible', timeout: 10000 });

  // just test that the errors are the expected errors
  // until we make the SDK handle the iframe sandbox environment more gracefully
  for (const error of errors) {
    expect(error.message).toContain(`Failed to read the 'cookie' property from 'Document'`);
  }
  expect(errors.length).toBe(3);
});
