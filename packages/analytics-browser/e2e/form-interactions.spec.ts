/* eslint-disable @typescript-eslint/no-unsafe-return */
import { test, expect } from '@playwright/test';

const FORM_STARTED_EVENT = '[Amplitude] Form Started';

test.describe('Form Interactions Page', () => {
  let requests: any[] = [];

  test.beforeEach(async ({ page }) => {
    requests = [];
    await page.route('https://api2.amplitude.com/2/httpapi', async (route) => {
      const request = route.request();
      const postData = request.postData();
      if (postData) {
        const data = JSON.parse(postData);
        requests.push(data);
      }
      console.log('added request');
      await route.continue();
    });
  });

  test('should track form started events', async ({ page }) => {
    await page.goto('/form-interactions/form-interactions.html');
    await page.waitForLoadState('networkidle');

    // Trigger form started by changing a form field (first interaction) and then navigate away to trigger pagehide/beforeunload → form abandoned
    await page.fill('#name', 'Test User');
    await page.fill('#email', 'test@example.com');
    // mock dispatch pagehide event
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await page.waitForTimeout(2000);

    // Wait for the form started event to be sent
    await expect(async () => {
      const allEvents = requests.flatMap((r) => r.events || []).filter((e: any) => e.event_type !== '$identify');
      expect(allEvents.some((e: any) => e.event_type === FORM_STARTED_EVENT)).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});
