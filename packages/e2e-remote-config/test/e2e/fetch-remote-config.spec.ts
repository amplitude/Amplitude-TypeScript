import { test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, no-restricted-globals */

test.describe('Fetch remote config', () => {
  test('should fetch remote config', async ({ page }) => {
    // intercept the fetch request to the remote config
    await page.route('https://sr-client-cfg**/config', async (route) => {
      
      await route.continue();
    });

    await page.goto('http://localhost:5173/remote-config-test.html');
  });
});
