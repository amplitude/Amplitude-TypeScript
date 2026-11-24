import { test, expect } from '@playwright/test';
import { parseRequestBody } from './helpers';

test.describe('GTM Snippet Page', () => {
  let requests: any[] = [];

  test.beforeEach(async ({ page }) => {
    requests = [];
    // Intercept Amplitude API calls
    await page.route('https://api2.amplitude.com/2/httpapi', async (route) => {
      const request = route.request();
      const data = parseRequestBody(request);
      if (data) {
        requests.push(data);
      }
      await route.continue();
    });
  });

  test('should load GTM snippet page and track event', async ({ page }) => {
    // Navigate to the GTM snippet page
    const response = await page.goto('/gtm-snippet/gtm-snippet.html', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Check if the response was successful
    expect(response?.status()).toBe(200);

    // Wait for the Amplitude SDK to be available
    await page.waitForFunction(
      () => {
        return typeof (window as any).amplitude !== 'undefined';
      },
      { timeout: 10000 },
    );

    // Verify amplitude is defined
    const amplitudeDefined = await page.evaluate(() => {
      return typeof (window as any).amplitude !== 'undefined';
    });
    expect(amplitudeDefined).toBe(true);

    // track an event and immediately flush to avoid batching delay
    await page.evaluate(async () => {
      (window as any).amplitude.track('GTM Snippet Test');
      await (window as any).amplitude.flush();
    });

    // Wait for network requests to complete
    await page.waitForLoadState('networkidle');
    // wait up to 10 seconds for the request to be made
    for (let i = 0; i < 20; i++) {
      if (requests.length > 0) break;
      await page.waitForTimeout(500);
    }

    // Verify the GTM Snippet Test event was tracked
    const events = requests[0].events;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);
    const gtmSnippetEvent = events.find((event: any) => event.event_type === 'GTM Snippet Test');
    expect(gtmSnippetEvent).toBeDefined();
    expect(gtmSnippetEvent.event_type).toBe('GTM Snippet Test');
  });
});
