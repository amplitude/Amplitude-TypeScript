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
 *
 * The fixture flips the shared selector engine into piercing mode via a config
 * override when navigated with `?shadow=on`; without it the engine stays on the
 * default (non-piercing) path. We assert:
 *   - ENABLED: a click inside an open shadow root emits a shadow-delimited path;
 *     a click in a nested (depth-2) tree emits TWO delimiters.
 *   - DISABLED: the light-DOM control captures normally; no path ever contains
 *     the delimiter.
 *   - BOTH: the page raises zero uncaught errors (the core safety guarantee).
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

    // Playwright locators pierce open shadow roots automatically.
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

  test('ENABLED: clicking a late-mounted shadow component is captured with a delimiter', async ({ page }) => {
    await page.goto('/shadow-dom-test.html?shadow=on');
    await expect(page.locator('#status')).toHaveAttribute('data-late', 'mounted');

    await page.click('#late-button');

    const paths = await clickedPaths(page);
    expect(paths.some((p) => p?.includes(SHADOW_DELIMITER))).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('ENABLED: exposure of a shadow element emits Viewport Content Updated with a delimited path', async ({
    page,
  }) => {
    const VIEWPORT_UPDATED = '[Amplitude] Viewport Content Updated';
    const EXPOSED_PROP = '[Amplitude] Element Exposed';

    await page.goto('/shadow-dom-test.html?shadow=on');
    await expect(page.locator('#status')).toHaveText('initialized-shadow');

    // The shadow button is at the top of the page and fully visible; wait past
    // the default exposure duration (2000ms) so it is marked exposed.
    await page.waitForTimeout(2500);
    // Flush the viewport-content-updated aggregate without unloading the page.
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));

    await expect
      .poll(() => events.filter((e) => e.event_type === VIEWPORT_UPDATED).length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    const exposedPaths = events
      .filter((e) => e.event_type === VIEWPORT_UPDATED)
      .flatMap((e) => (e.event_properties?.[EXPOSED_PROP] as string[]) ?? []);
    expect(exposedPaths.some((p) => p?.includes(SHADOW_DELIMITER))).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('DISABLED: light-DOM control captures normally and no path is delimited', async ({ page }) => {
    await page.goto('/shadow-dom-test.html');
    await expect(page.locator('#status')).toHaveText('initialized');

    await page.click('#light-button');

    const paths = await clickedPaths(page);
    expect(paths).toContain('button#light-button');
    expect(paths.every((p) => !p?.includes(SHADOW_DELIMITER))).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('DISABLED: clicking inside an open shadow root never produces a delimited path or an error', async ({
    page,
  }) => {
    await page.goto('/shadow-dom-test.html');
    await expect(page.locator('#status')).toHaveText('initialized');

    // With shadow off, the event retargets to the (untracked) host; whether or
    // not an event is emitted, it must never be delimited and must never throw.
    await page.click('#shadow-button');
    // Also click the light control so there is at least one event to inspect.
    await page.click('#light-button');

    const paths = await clickedPaths(page);
    expect(paths.every((p) => !p?.includes(SHADOW_DELIMITER))).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
