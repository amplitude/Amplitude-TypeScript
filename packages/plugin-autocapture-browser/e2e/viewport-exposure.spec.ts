import { test, expect, Page, Request } from '@playwright/test';
import { gunzipSync } from 'zlib';

const TRACK_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
const VIEWPORT_CONTENT_UPDATED = '[Amplitude] Viewport Content Updated';
const ELEMENT_EXPOSED_PROP = '[Amplitude] Element Exposed';
const TARGET_PATH = 'button#exposure-target';
const OVERSIZED_TARGET_PATH = 'button#oversized-target';
const NESTED_SCROLL_TARGET_PATH = 'button#nested-scroll-target';

// The harness configures exposureDuration: 150. Wait comfortably longer so a slow
// runner cannot mistake "not exposed yet" for "not exposed at all".
const EXPOSURE_SETTLE_MS = 1_000;

interface AmplitudeEvent {
  event_type: string;
  event_properties?: Record<string, unknown>;
}

// Scroll/flush helpers the harness page hangs off `window` so the geometry math
// lives next to the markup it depends on.
declare global {
  interface Window {
    __exposureHarness: {
      scrollElementTo: (fraction: number, element?: Element) => Promise<number>;
      visibleFraction: (element: Element) => number;
      viewedDepth: (element: Element) => number;
      isMidHeightLineVisible: (element: Element) => boolean;
      flush: () => void;
      setAutoFlush: (enabled: boolean) => void;
      exposedPaths: string[];
      payloads: { at: string; event: AmplitudeEvent }[];
      EXPOSURE_DURATION: number;
    };
  }
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
 * Real-browser coverage for Contentsquare-style midpoint exposure behind
 * `[Amplitude] Viewport Content Updated`. jsdom has no layout and no
 * IntersectionObserver, so the unit tests can only feed synthetic entries to
 * `trackExposure`; only a real browser exercises the observer options in
 * `createExposureObservable` together with actual scroll geometry.
 *
 * The same page doubles as a manual harness — it has a scroll/flush control bar
 * and a live visibility readout. From the repo root, after `pnpm build`:
 *   npx vite dev   # then open http://localhost:5173/autocapture/viewport-exposure.html
 * `pnpm start` serves the same pages, but only after `pnpm build:vite`.
 */
test.describe('autocapture viewport exposure (mid-height line)', () => {
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

  async function openHarness(page: Page, query = ''): Promise<void> {
    await page.goto(`/autocapture/viewport-exposure.html${query}`);
    await expect(page.locator('#status')).toHaveText('initialized');
    // The page auto-flushes so a human sees exposures while scrolling. That resets
    // exposure state on a timer, so drive flushes by hand inside the tests.
    await page.evaluate(() => window.__exposureHarness.setAutoFlush(false));
    // The initial snapshot reports whatever is already on screen; drop it so each
    // test only sees exposures caused by its own scrolling.
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());
    events = [];
  }

  /** Scroll to `fraction` of the target's depth, then flush and collect exposed paths. */
  async function exposedPathsAfterScrollingTo(page: Page, fraction: number): Promise<string[]> {
    const achieved = await page.evaluate((f) => window.__exposureHarness.scrollElementTo(f), fraction);
    // Guard the scroll depth itself: a mis-sized page would make the assertions meaningless.
    expect(achieved).toBeCloseTo(fraction, 2);

    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());

    await expect
      .poll(() => events.filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED).length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    return events
      .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
      .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []);
  }

  test('exposes an element after its 60% depth has been viewed', async ({ page }) => {
    await openHarness(page);

    const paths = await exposedPathsAfterScrollingTo(page, 0.6);

    expect(paths, `expected ${TARGET_PATH} in ${JSON.stringify(paths)}`).toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('exposes an element when its mid-height line is reached', async ({ page }) => {
    await openHarness(page);

    const paths = await exposedPathsAfterScrollingTo(page, 0.5);

    expect(paths, `expected ${TARGET_PATH} in ${JSON.stringify(paths)}`).toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('reports the exposed element inside the Viewport Content Updated payload', async ({ page }) => {
    await openHarness(page);
    await exposedPathsAfterScrollingTo(page, 0.6);

    const payload = events.find(
      (e) =>
        e.event_type === VIEWPORT_CONTENT_UPDATED &&
        ((e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []).includes(TARGET_PATH),
    );

    expect(payload, `no payload carried ${TARGET_PATH}: ${JSON.stringify(events)}`).toBeDefined();
    expect(payload?.event_properties?.[ELEMENT_EXPOSED_PROP]).toEqual(expect.arrayContaining([TARGET_PATH]));
    expect(payload?.event_properties).toMatchObject({
      '[Amplitude] Page URL': expect.stringContaining('/autocapture/viewport-exposure.html'),
      '[Amplitude] Viewport Height': expect.any(Number),
      '[Amplitude] Viewport Width': expect.any(Number),
      '[Amplitude] Max Page X': expect.any(Number),
      '[Amplitude] Max Page Y': expect.any(Number),
    });

    // The harness panel shows the same object, so what a human reads is what was sent.
    const shown = await page.evaluate(() => window.__exposureHarness.payloads.map((entry) => entry.event));
    expect(shown).toEqual(expect.arrayContaining([expect.objectContaining({ event_type: VIEWPORT_CONTENT_UPDATED })]));
    expect(
      shown.flatMap((event) => (event.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
    ).toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('does not expose an element when only its first 30% has been viewed', async ({ page }) => {
    await openHarness(page);

    const paths = await exposedPathsAfterScrollingTo(page, 0.3);

    expect(paths).not.toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('does not expose an element before its mid-height line is reached', async ({ page }) => {
    await openHarness(page);

    const paths = await exposedPathsAfterScrollingTo(page, 0.49);

    expect(paths).not.toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('still exposes an element after its full depth has been viewed', async ({ page }) => {
    await openHarness(page);

    const paths = await exposedPathsAfterScrollingTo(page, 1);

    expect(paths, `expected ${TARGET_PATH} in ${JSON.stringify(paths)}`).toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('does not expose an element that scrolls back below half before the exposure duration', async ({ page }) => {
    // A 150ms dwell would leave this racing the runner: the scroll away has to land
    // inside it, and a loaded machine can overshoot. A long dwell makes the visit
    // unambiguously too short while testing the same rule.
    await openHarness(page, '?exposureDuration=5000');

    // Cross the midpoint, then leave again far inside the 5s dwell.
    await page.evaluate(() => window.__exposureHarness.scrollElementTo(0.6));
    await page.evaluate(() => window.__exposureHarness.scrollElementTo(0.2));

    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);

    const paths = events
      .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
      .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []);
    expect(paths).not.toContain(TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('tracks midpoint exposure inside an overflow container without counting clipped content', async ({ page }) => {
    await openHarness(page);

    const scroller = page.locator('#overflow-container');
    await scroller.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      document.getElementById('overflow-container')!.scrollTop = 0;
    });
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);

    const before = events
      .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
      .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []);
    expect(before).not.toContain(NESTED_SCROLL_TARGET_PATH);

    events = [];
    await page.evaluate(() => {
      // The target begins with 50px visible in a 300px scroller, but its midpoint
      // is below the clip edge. Scrolling 60px brings that midpoint into the panel.
      document.getElementById('overflow-container')!.scrollTop = 60;
    });
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());

    await expect
      .poll(
        () =>
          events
            .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
            .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
        { timeout: 10_000 },
      )
      .toContain(NESTED_SCROLL_TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });

  test('does not clip a viewport-fixed element against an overflow ancestor', async ({ page }) => {
    await openHarness(page);

    await page.evaluate(() => {
      const clipper = document.createElement('div');
      clipper.style.cssText = 'position:absolute;top:400px;height:20px;overflow:hidden';
      const element = document.createElement('button');
      element.id = 'fixed-exposure-target';
      element.style.cssText = 'position:fixed;top:100px;left:20px;width:100px;height:100px';
      element.textContent = 'fixed target';
      clipper.appendChild(element);
      document.body.appendChild(clipper);
    });

    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());

    await expect
      .poll(
        () =>
          events
            .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
            .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
        { timeout: 10_000 },
      )
      .toContain('button#fixed-exposure-target');
    expect(pageErrors).toEqual([]);
  });

  test('rechecks midpoint exposure when the viewport is resized', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await openHarness(page);

    await page.evaluate(() => {
      const element = document.createElement('button');
      element.id = 'resize-exposure-target';
      // Partly visible, but its midpoint starts 50px below the viewport.
      element.style.cssText = 'position:fixed;top:550px;left:20px;width:100px;height:200px';
      element.textContent = 'resize target';
      document.body.appendChild(element);
    });
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());
    expect(
      events.flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
    ).not.toContain('button#resize-exposure-target');

    events = [];
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());

    await expect
      .poll(
        () =>
          events
            .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
            .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
        { timeout: 10_000 },
      )
      .toContain('button#resize-exposure-target');
    expect(pageErrors).toEqual([]);
  });

  test('exposes an oversized zone when its midpoint is viewed', async ({ page }) => {
    await openHarness(page);

    const geometry = await page.evaluate(async () => {
      const element = document.getElementById('oversized-target')!;
      const depth = await window.__exposureHarness.scrollElementTo(0.5, element);
      return {
        depth,
        visibleFraction: window.__exposureHarness.visibleFraction(element),
        midpointVisible: window.__exposureHarness.isMidHeightLineVisible(element),
      };
    });
    expect(geometry.depth).toBeCloseTo(0.5, 2);
    expect(geometry.visibleFraction).toBeLessThan(0.5);
    expect(geometry.midpointVisible).toBe(true);

    await page.waitForTimeout(EXPOSURE_SETTLE_MS);
    await page.evaluate(() => window.__exposureHarness.flush());
    await expect
      .poll(
        () =>
          events
            .filter((e) => e.event_type === VIEWPORT_CONTENT_UPDATED)
            .flatMap((e) => (e.event_properties?.[ELEMENT_EXPOSED_PROP] as string[] | undefined) ?? []),
        { timeout: 10_000 },
      )
      .toContain(OVERSIZED_TARGET_PATH);
    expect(pageErrors).toEqual([]);
  });
});
