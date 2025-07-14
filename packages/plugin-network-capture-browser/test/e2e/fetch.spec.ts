import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/await-thenable */

test.describe('Network Capture Plugin - Fetch Tests', () => {
  test('fetch.html page loads and runs without errors', async ({ page }) => {
    // Listen for any uncaught exceptions
    const uncaughtExceptions: string[] = [];
    await page.route('https://httpstat.us/*', async (route) => {
      const status = route.request().url().split('/').pop();
      await route.fulfill({
        status: Number(status),
        body: JSON.stringify({
          message: 'OK',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
    page.on('pageerror', (error) => {
      uncaughtExceptions.push(error.message);
    });

    // Load the fetch.html page
    await page.goto('http://localhost:5173/network-capture/fetch.html');

    // Wait for the completion indicator to show tests are done
    const completionIndicator = page.locator('#completion-indicator');
    await completionIndicator.waitFor({ state: 'visible' });
    await expect(completionIndicator).toHaveAttribute('data-complete', 'true', { timeout: 90000 });

    // Check that there were no uncaught exceptions
    expect(uncaughtExceptions).toHaveLength(0);

    // Verify that results are displayed on the page
    const resultsContainer = await page.locator('#results');
    await expect(resultsContainer).toBeVisible();

    // Verify that we have some result items
    const resultItems = await page.locator('.result-item');
    const count = await resultItems.count();
    expect(count).toBeGreaterThan(0);

    // Verify that all result items have either success or error class
    const items = await resultItems.all();
    for (const item of items) {
      const className = await item.getAttribute('class');
      expect(className).toMatch(/result-item (success|error)/);
    }
  });
});
