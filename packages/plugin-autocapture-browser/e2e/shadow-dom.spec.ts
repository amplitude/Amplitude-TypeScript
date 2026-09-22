import { test, expect, Page, Request } from '@playwright/test';
import { gunzipSync } from 'zlib';

const TRACK_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
const ELEMENT_CLICKED = '[Amplitude] Element Clicked';
const ELEMENT_PATH_PROP = '[Amplitude] Element Path';
const SHADOW_DELIMITER = ' >>> ';

interface AmplitudeEvent {
  event_type: string;
  event_properties?: Record<string, unknown>;
}

function parseRequestBody(request: Request): Record<string, unknown> | undefined {
  const contentEncoding = request.headers()['content-encoding'];
  if (contentEncoding === 'gzip') {
    const buffer = request.postDataBuffer();
    if (!buffer || buffer.length === 0) return undefined;
    return JSON.parse(gunzipSync(buffer).toString('utf8')) as Record<string, unknown>;
  }
  const postData = request.postData();
  if (!postData) return undefined;
  return JSON.parse(postData) as Record<string, unknown>;
}

/**
 * Real-browser coverage for shadow-DOM autocapture. jsdom can't fully model
 * event retargeting, `composedPath`, or Playwright-style shadow-piercing
 * clicks, so these run in Chromium/WebKit against `shadow-dom-test.html`.
 */
test.describe('shadow-DOM autocapture', () => {
  let events: AmplitudeEvent[] = [];
  let pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    events = [];
    pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.route(TRACK_ENDPOINT, async (route) => {
      const body = parseRequestBody(route.request());
      const batch = body?.events;
      if (Array.isArray(batch)) {
        events.push(...(batch as AmplitudeEvent[]));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, events_ingested: 0, payload_size_bytes: 0, server_upload_time: 0 }),
      });
    });
  });

  async function clickedPaths(page: Page): Promise<string[]> {
    await expect
      .poll(() => events.filter((e) => e.event_type === ELEMENT_CLICKED).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    return events
      .filter((e) => e.event_type === ELEMENT_CLICKED)
      .map((e) => e.event_properties?.[ELEMENT_PATH_PROP] as string);
  }

  test('ENABLED: click inside an open shadow root emits a shadow-delimited path', async ({ page }) => {
    await page.goto('/shadow-dom-test.html?shadow=on');
    await expect(page.locator('#status')).toHaveText('initialized-shadow');

    await page.click('#shadow-button');

    const paths = await clickedPaths(page);
    const shadowPath = paths.find((p) => p?.includes(SHADOW_DELIMITER));
    expect(shadowPath, `expected a delimited path in ${JSON.stringify(paths)}`).toBeTruthy();
    expect(shadowPath).toContain('button');
    expect(pageErrors).toEqual([]);
  });

  test('ENABLED: click in a nested (depth-2) shadow tree emits two delimiters', async ({ page }) => {
    await page.goto('/shadow-dom-test.html?shadow=on');
    await expect(page.locator('#status')).toHaveText('initialized-shadow');

    await page.click('#deep-button');

    const paths = await clickedPaths(page);
    const deepPath = paths.find((p) => (p?.match(/ >>> /g) || []).length >= 2);
    expect(deepPath, `expected a 2-delimiter path in ${JSON.stringify(paths)}`).toBeTruthy();
    expect(pageErrors).toEqual([]);
  });

  test('DISABLED: clicking inside a shadow root never produces a delimited path or an error', async ({ page }) => {
    await page.goto('/shadow-dom-test.html');
    await expect(page.locator('#status')).toHaveText('initialized');

    await page.click('#shadow-button');
    await page.click('#light-button');

    const paths = await clickedPaths(page);
    expect(paths.every((p) => !p?.includes(SHADOW_DELIMITER))).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
