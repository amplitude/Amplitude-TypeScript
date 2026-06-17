import { test, expect, Page, Request } from '@playwright/test';
import { gunzipSync } from 'zlib';

const TRACK_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
const ELEMENT_CLICKED = '[Amplitude] Element Clicked';
const ELEMENT_PATH_PROP = '[Amplitude] Element Path';

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
 * End-to-end coverage for the element-selector engine integration. These run in
 * a real browser, so they exercise the full path that jsdom unit tests cannot:
 * `DataExtractor.getElementPath` -> `engine.generate` -> (dormant) legacy
 * `cssPath`, including the real `CSS.escape` and real layout/sibling structure.
 *
 * The engine ships dormant (default config, `enabled: false`), so the emitted
 * `[Amplitude] Element Path` must match the legacy walker output exactly. These
 * tests guard that the swap from the local `cssPath` to the engine did not
 * change production selectors.
 */
test.describe('autocapture Element Path (element-selector engine)', () => {
  let events: AmplitudeEvent[] = [];

  test.beforeEach(async ({ page }) => {
    events = [];
    await page.route(TRACK_ENDPOINT, async (route) => {
      const body = parseRequestBody(route.request());
      const batch = body?.events;
      if (Array.isArray(batch)) {
        events.push(...(batch as AmplitudeEvent[]));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          events_ingested: Array.isArray(batch) ? batch.length : 0,
          payload_size_bytes: 0,
          server_upload_time: Date.now(),
        }),
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

  test('anchors on a stable id', async ({ page }) => {
    await page.goto('/element-selector-test.html');
    await expect(page.locator('#status')).toHaveText('initialized');

    await page.click('#cta-button');

    const paths = await clickedPaths(page);
    expect(paths).toContain('button#cta-button');
  });

  test('disambiguates an id-less element positionally and anchors on the nearest ancestor id', async ({ page }) => {
    await page.goto('/element-selector-test.html');
    await expect(page.locator('#status')).toHaveText('initialized');

    // Click the second of two sibling buttons that share a class but have no id.
    await page.click('#container section button:nth-child(2)');

    const paths = await clickedPaths(page);
    expect(paths).toContain('div#container > section > button:nth-child(2)');
  });
});
