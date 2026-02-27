import { test, expect } from '@playwright/test';

const RUNS = 10;

test.describe('CookieStorage', () => {
  // Regression Test to cover re-entrancy issues fixed by https://github.com/amplitude/Amplitude-TypeScript/pull/1539
  test('.isEnabled works when called multiple times concurrently', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    for (let i = 0; i < RUNS; i++) {
      await page.goto('/cookies/is-enabled.html');
      expect(pageErrors, `Expected no page errors, but got: ${pageErrors.join('; ')}`).toHaveLength(0);
      expect(consoleErrors, `Expected no console.error calls, but got: ${consoleErrors.join('; ')}`).toHaveLength(0);
    }
  });
});
