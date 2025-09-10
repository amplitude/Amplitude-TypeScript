import { test, expect } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

test.describe('XHR network tracking', () => {
  // override remote config
  test.beforeEach(async ({ page }) => {
    await page.route('https://sr-client-cfg.amplitude.com/config/*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          configs: {
            sessionReplay: {},
            analyticsSDK: {
              browserSDK: {
                autocapture: {
                  sessions: false,
                  networkTracking: {
                    captureRules: [
                      {
                        urlsRegex: ['.*/api/status/.*'],
                        statusCodeRange: '400-599',
                      },
                    ],
                  },
                },
              },
            },
          },
        }),
      });
    });
  });

  test('should track XHR requests', async ({ page }) => {
    // Navigate to the test page - no need to mock routes since we have a mock API server
    await page.goto('http://localhost:5173/network-capture/xhr.html');

    // Wait for the completion indicator to be visible
    const completionIndicator = page.locator('#completion-indicator');
    await completionIndicator.waitFor({ state: 'visible' });

    // Wait for the completion indicator to show success
    await expect(completionIndicator).toHaveAttribute('data-complete', 'true', { timeout: 30000 });

    // Check that there were no uncaught exceptions
    const consoleErrors = await page.evaluate(() => {
      return (window as any).__consoleErrors || [];
    });
    expect(consoleErrors).toHaveLength(0);
  });
});
