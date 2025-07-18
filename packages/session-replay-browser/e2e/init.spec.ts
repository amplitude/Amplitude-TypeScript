import { test, expect } from '@playwright/test';

test.describe('Session Replay SDK Initialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/session-replay/session-replay-test.html');
  });

  test('should initialize SDKs successfully', async ({ page }) => {
    // Wait for SDKs to initialize
    await page.waitForSelector('#session-replay-status.complete');
    await page.waitForSelector('#analytics-status.complete');

    // Verify status elements
    const sessionReplayStatus = page.locator('#session-replay-status');
    const analyticsStatus = page.locator('#analytics-status');

    await expect(sessionReplayStatus).toHaveClass(/complete/);
    await expect(analyticsStatus).toHaveClass(/complete/);
  });
});
