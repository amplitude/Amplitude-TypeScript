import { test, expect } from '@playwright/test';

test.describe('CookieStorage', () => {
  test('.prototype.isEnabled works when called multiple times concurrently', async ({ page }) => {
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

    await page.goto('/cookies/is-enabled.html');
    await expect(page.locator('#out')).toContainText('Parallel calls:', { timeout: 10000 });

    expect(pageErrors, `Expected no page errors, but got: ${pageErrors.join('; ')}`).toHaveLength(0);
    expect(consoleErrors, `Expected no console.error calls, but got: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });
});
