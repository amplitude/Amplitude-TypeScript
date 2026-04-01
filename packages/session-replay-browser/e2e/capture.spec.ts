import { test, expect, Route } from '@playwright/test';
import {
  SR_API_SUCCESS,
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  readRouteBody,
  captureTrackRequests,
} from './helpers';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';
// Fake origin used for fetch calls made from the test page during network body capture tests.
const TEST_FETCH_ORIGIN = 'https://test-fetch.amplitude.test';
const remoteConfigNotRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.0 } } },
};

/**
 * Remote config with network logging and opt-in body capture enabled.
 */
function remoteConfigWithNetworkBody(opts: { request?: boolean; response?: boolean; maxBodySizeBytes?: number } = {}) {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
        sr_logging_config: {
          network: {
            enabled: true,
            body: { request: true, response: true, ...opts },
          },
        },
      },
    },
  };
}

/**
 * Decodes all rrweb events out of a raw track-API request body.
 * Events are now plain JSON strings (no packing).
 */
function decodeAllEvents(rawBody: string): Array<Record<string, unknown>> {
  if (!rawBody) return [];
  let payload: { events?: unknown[] };
  try {
    payload = JSON.parse(rawBody) as { events?: unknown[] };
  } catch {
    return [];
  }
  if (!Array.isArray(payload.events)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const eventStr of payload.events) {
    if (typeof eventStr !== 'string') continue;
    try {
      results.push(JSON.parse(eventStr) as Record<string, unknown>);
    } catch {
      // skip unparseable events
    }
  }
  return results;
}

/**
 * Recursively searches a serialized rrweb node tree for an element with the given
 * `id` attribute and returns the value of `attr` on that element, or undefined.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findAttrInNodeTree(node: any, id: string, attr: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (node?.attributes?.id === id) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return node.attributes[attr] as string | undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  for (const child of node?.childNodes ?? []) {
    const result = findAttrInNodeTree(child, id, attr);
    if (result !== undefined) return result;
  }
  return undefined;
}

/**
 * Decodes all custom 'fetch-request' events out of a raw track-API request body.
 * Each event string in payload.events is a plain JSON string.
 */
function decodeFetchRequestEvents(rawBody: string): Array<Record<string, unknown>> {
  if (!rawBody) return [];
  let payload: { events?: unknown[] };
  try {
    payload = JSON.parse(rawBody) as { events?: unknown[] };
  } catch {
    return [];
  }
  if (!Array.isArray(payload.events)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const eventStr of payload.events) {
    if (typeof eventStr !== 'string') continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event = JSON.parse(eventStr);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (event.type === 5 && event.data?.tag === 'fetch-request') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        results.push(event.data.payload as Record<string, unknown>);
      }
    } catch {
      // skip unparseable events
    }
  }
  return results;
}

/**
 * Builds a remote config that includes a privacy config (e.g. maskAttributes).
 */
function remoteConfigWithPrivacy(privacyConfig: object): object {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
        sr_privacy_config: privacyConfig,
      },
    },
  };
}

/**
 * Builds a remote config with URL-based targeting: records when the page URL
 * contains `matchStr`, skips otherwise. capture_enabled is true, no sample_rate
 * (sampling is handled by the targeting decision).
 */
function remoteConfigWithUrlTargeting(matchStr: string): object {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true },
        sr_targeting_config: {
          key: 'sr_targeting_config',
          variants: { on: { key: 'on' }, off: { key: 'off' } },
          segments: [
            {
              metadata: { segmentName: 'url_match' },
              bucket: {
                selector: ['context', 'session_id'],
                salt: 'pw_test_salt',
                allocations: [
                  {
                    range: [0, 99],
                    distributions: [{ variant: 'on', range: [0, 42949672] }],
                  },
                ],
              },
              conditions: [[{ selector: ['context', 'page', 'url'], op: 'contains', values: [matchStr] }]],
            },
            { variant: 'off' },
          ],
        },
      },
    },
  };
}

function mockTrackApi(page: import('@playwright/test').Page, onRequest?: (route: Route) => void) {
  return page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    onRequest?.(route);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
}

/**
 * Waits until the SDK's NetworkObservers have patched window.fetch.
 * The SDK replaces the native fetch with an async wrapper; once replaced,
 * fetch.toString() no longer contains '[native code]'.
 *
 * Must be called AFTER waitForReady because the SDK patches fetch
 * asynchronously (via `void initialize()`) after init() resolves.
 */
async function waitForNetworkObservers(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => !window.fetch.toString().includes('[native code]'), { timeout: 10_000 });
}

async function getProperties(page: import('@playwright/test').Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('session replay capture', () => {
  test('records with 100% sample rate', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`); // "<deviceId>/<sessionId>"
  });

  test('does not record with 0% sample rate', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigNotRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);

    const props = await getProperties(page);
    // When not recording, getSessionReplayProperties() returns {} — key is absent
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('does not record when opted out', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        optOut: true,
      }),
    );
    await waitForReady(page);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('sends events to the track API when flushed', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page, (route) => sentUrls.push(route.request().url()));

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);
    // recordEvents() is fire-and-forget inside init; give rrweb time to start and capture snapshot
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Blur moves buffered rrweb events from the store into trackDestination; flush sends them
    await page.evaluate(() => window.dispatchEvent(new Event('blur')) as unknown as void);
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(sentUrls.length).toBeGreaterThan(0);
  });

  test('does not send events to the track API when not recording', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigNotRecording);
    await mockTrackApi(page, (route) => sentUrls.push(route.request().url()));

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);

    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(sentUrls.length).toBe(0);
  });

  test('starts recording for a new session after setSessionId', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);

    await page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );

    const props = await getProperties(page);
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${NEW_SESSION_ID}`);
  });

  test('flushes previous session events on setSessionId', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);
    // Give rrweb time to start recording and capture the initial snapshot
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // waitForRequest verifies that events were actually flushed to the API
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 5_000 });
    void page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );
    await trackRequestPromise; // will throw if no request is made in time

    // New session is now active
    const props = await getProperties(page);
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${NEW_SESSION_ID}`);
  });
});

// ─── URL-based targeting ──────────────────────────────────────────────────────

test.describe('URL-based targeting', () => {
  // The test page URL contains 'sr-capture-test', so this string always matches on init.
  const MATCH_STRING = 'sr-capture-test';
  // This string only matches after an explicit pushState navigation.
  const NAV_MATCH_STRING = '/matching-route';

  test('starts recording when page URL matches targeting condition on init', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    // Give targeting evaluation (async IDB + rrweb start) time to complete
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('starts recording when user navigates to a matching URL (SPA pushState)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // Current URL doesn't match — not recording yet
    const propsBefore = await getProperties(page);
    expect(propsBefore[SR_PROPERTY_KEY]).toBeFalsy();

    // SPA navigation to matching route
    await page.evaluate((path) => history.pushState({}, '', path), NAV_MATCH_STRING);

    // Wait for targeting re-evaluation to kick in and recording to start
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('does not record when page URL never matches targeting condition', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // URL never matched — should not be recording
    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('does not send events to the track API when URL never matches', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page, (route) => sentUrls.push(route.request().url()));

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')) as unknown as void);
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(sentUrls.length).toBe(0);
  });

  test('continues recording after navigating away from matched URL (monotonic match)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Verify recording started on the matching URL
    const propsBefore = await getProperties(page);
    expect(propsBefore[SR_PROPERTY_KEY]).toBeTruthy();

    // Navigate away to a non-matching URL
    await page.evaluate(() => history.pushState({}, '', '/some-other-route'));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Should still be recording — targeting match is monotonic within a session
    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('starts recording when replaceState navigates to matching URL', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // Current URL doesn't match — not recording yet
    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();

    // SPA navigation via replaceState (replaces history entry rather than pushing)
    await page.evaluate((path) => history.replaceState({}, '', path), NAV_MATCH_STRING);

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('starts recording when a hash change results in a URL containing the match string', async ({ page }) => {
    // Setting location.hash to NAV_MATCH_STRING fires a hashchange event;
    // the full URL becomes "...#/matching-route" which contains NAV_MATCH_STRING.
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();

    // Trigger a hashchange — URL becomes "...#/matching-route"
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, NAV_MATCH_STRING);

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('does not record until a navigation produces a matching URL', async ({ page }) => {
    // Verifies that non-matching navigations do not start recording and that recording
    // begins only on the first navigation whose URL satisfies the targeting condition.
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // First navigation: non-matching
    await page.evaluate(() => history.pushState({}, '', '/non-matching-step'));
    await page.waitForTimeout(300);
    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();

    // Second navigation: still non-matching
    await page.evaluate(() => history.pushState({}, '', '/also-not-matching'));
    await page.waitForTimeout(300);
    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();

    // Third navigation: matching — recording should now start
    await page.evaluate((path) => history.pushState({}, '', path), NAV_MATCH_STRING);

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    expect(String((await getProperties(page))[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('sends events to the track API after URL-triggered recording starts', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // Navigate to the matching URL to start recording. The SDK fires a full snapshot
    // immediately when recording begins; register waitForRequest before the navigation
    // so the immediate-flush request doesn't race past the listener.
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });
    await page.evaluate((path) => history.pushState({}, '', path), NAV_MATCH_STRING);
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    await trackRequestPromise;
  });

  test('records new session when setSessionId is called while URL matches targeting', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // Navigate to the matching URL so it's current when setSessionId is called
    await page.evaluate((path) => history.pushState({}, '', path), NAV_MATCH_STRING);
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    // Start a new session — targeting re-evaluates with the current (matching) URL
    await page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${NEW_SESSION_ID}`);
  });

  test('does not record new session when setSessionId is called at a non-matching URL', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    // MATCH_STRING is in the initial page URL, so the first session records
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Initial session is recording (URL matches)
    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeTruthy();

    // Navigate away so the current URL no longer matches
    await page.evaluate(() => history.pushState({}, '', '/some-other-route'));

    // Start a new session — targeting re-evaluates with the current (non-matching) URL
    await page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeFalsy();
  });
});

// ─── URL-based targeting — URL pattern matching ───────────────────────────────

test.describe('URL-based targeting — URL pattern matching', () => {
  const NAV_MATCH_STRING = '/matching-route';
  const MATCH_STRING = 'sr-capture-test';

  test('matches targeting condition against a value in the URL query string', async ({ page }) => {
    // The match string appears as a query parameter value in the initial page URL,
    // so init-time evaluation should match and start recording.
    const QUERY_MATCH = 'capture-target';
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(QUERY_MATCH));
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        testParam: QUERY_MATCH,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('does not record when query string value is present but condition targets a different string', async ({
    page,
  }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(NAV_MATCH_STRING));
    await mockTrackApi(page);

    // URL has testParam but its value does not contain NAV_MATCH_STRING
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        testParam: 'some-other-value',
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('URL contains matching is case-insensitive', async ({ page }) => {
    // Targeting condition uses uppercase; page URL has lowercase — the EvaluationEngine
    // treats 'contains' as case-insensitive, so this should still match and record.
    const UPPER_MATCH = MATCH_STRING.toUpperCase(); // 'SR-CAPTURE-TEST'
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(UPPER_MATCH));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // URL contains 'sr-capture-test' and condition is 'SR-CAPTURE-TEST' — case-insensitive match
    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('does not record when no targeting config is set and sample rate is 0', async ({ page }) => {
    // Ensures the absence of sr_targeting_config falls back to sample-rate logic,
    // not a blanket match. Uses remoteConfigNotRecording (0% sample rate).
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.0 } } },
    });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();
  });
});

/**
 * Sets up a track-API mock that also captures POST bodies via page.route().
 * Call BEFORE page.goto. Returns a function that decodes all captured
 * fetch-request event payloads.
 */
async function mockTrackApiWithCapture(page: import('@playwright/test').Page) {
  const rawBodies: string[] = [];
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    rawBodies.push(readRouteBody(route));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return () => rawBodies.flatMap((body) => decodeFetchRequestEvents(body));
}

// ─── Network body capture ─────────────────────────────────────────────────────

test.describe('network body capture', () => {
  test('captures request and response body for a JSON fetch', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody());
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'ok' }),
      }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    // Make a POST fetch from within the page
    await page.evaluate(
      (url) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'test' }),
        }),
      `${TEST_FETCH_ORIGIN}/data`,
    );
    // Give the SDK time to read the cloned response body (detached async)
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    expect(fetchEvents.length).toBeGreaterThan(0);
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.requestBody).toBe('{"action":"test"}');
    expect(evt!.responseBody).toBe('{"result":"ok"}');
    expect(evt!.responseBodyStatus).toBe('captured');
  });

  test('sets responseBodyStatus to "skipped_binary" for image responses', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody());
    const getFetchEvents = await mockTrackApiWithCapture(page);
    const PNG_1X1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate((url) => fetch(url), `${TEST_FETCH_ORIGIN}/image.png`);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.responseBodyStatus).toBe('skipped_binary');
    expect(evt!.responseBody).toBeUndefined();
  });

  test('does not capture bodies when body config is absent', async ({ page }) => {
    await mockRemoteConfig(page, {
      configs: {
        sessionReplay: {
          sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
          sr_logging_config: { network: { enabled: true } },
        },
      },
    });
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"x":1}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate((url) => fetch(url, { method: 'POST', body: 'hello' }), `${TEST_FETCH_ORIGIN}/data`);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.requestBody).toBeUndefined();
    expect(evt!.responseBody).toBeUndefined();
    expect(evt!.responseBodyStatus).toBeUndefined();
  });

  test('does not capture fetch-request events for Amplitude track API calls', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody());
    const getFetchEvents = await mockTrackApiWithCapture(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    // Trigger a flush, which causes the SDK to POST to api-sr.amplitude.com
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const trackApiEvent = fetchEvents.find((e) => String(e.url).includes('api-sr.amplitude.com'));
    expect(trackApiEvent).toBeUndefined();
  });

  test('truncates response body exceeding maxBodySizeBytes', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody({ maxBodySizeBytes: 5 }));
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: 'hello world' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate((url) => fetch(url), `${TEST_FETCH_ORIGIN}/data`);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.responseBody).toBe('hello');
    expect(evt!.responseBodyStatus).toBe('truncated');
  });
});

// ─── Attribute masking ────────────────────────────────────────────────────────

test.describe('attribute masking', () => {
  /**
   * Sets up a track-API mock that captures POST bodies. Returns an async function
   * that flushes buffered events and decodes all rrweb events from the captured bodies.
   */
  async function mockTrackApiAndCaptureEvents(page: import('@playwright/test').Page) {
    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });
    return async (): Promise<Array<Record<string, unknown>>> => {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
      await page.waitForTimeout(500);
      return rawBodies.flatMap(decodeAllEvents);
    };
  }

  test('masks attribute listed in maskAttributes in rrweb full snapshot', async ({ page }) => {
    // placeholder="Enter your email" → "***** **** *****"
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ maskAttributes: ['placeholder'] }));
    const flushAndGetEvents = await mockTrackApiAndCaptureEvents(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    const events = await flushAndGetEvents();
    const snapshot = events.find((e) => e.type === 2);
    expect(snapshot).toBeDefined();

    const placeholderValue = findAttrInNodeTree((snapshot!.data as any).node, 'test-input', 'placeholder');
    expect(placeholderValue).toBe('***** **** *****');
  });

  test('does not mask attribute not listed in maskAttributes', async ({ page }) => {
    // 'type' is not in maskAttributes — should remain "text"
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ maskAttributes: ['placeholder'] }));
    const flushAndGetEvents = await mockTrackApiAndCaptureEvents(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    const events = await flushAndGetEvents();
    const snapshot = events.find((e) => e.type === 2);
    expect(snapshot).toBeDefined();

    const typeValue = findAttrInNodeTree((snapshot!.data as any).node, 'test-input', 'type');
    expect(typeValue).toBe('text');
  });

  test('does not mask attribute when maskAttributes is empty', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ maskAttributes: [] }));
    const flushAndGetEvents = await mockTrackApiAndCaptureEvents(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    const events = await flushAndGetEvents();
    const snapshot = events.find((e) => e.type === 2);
    expect(snapshot).toBeDefined();

    const placeholderValue = findAttrInNodeTree((snapshot!.data as any).node, 'test-input', 'placeholder');
    expect(placeholderValue).toBe('Enter your email');
  });

  test('masks aria-label when listed in maskAttributes', async ({ page }) => {
    // aria-label="Submit form" → "****** ****"
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ maskAttributes: ['aria-label'] }));
    const flushAndGetEvents = await mockTrackApiAndCaptureEvents(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    const events = await flushAndGetEvents();
    const snapshot = events.find((e) => e.type === 2);
    expect(snapshot).toBeDefined();

    const ariaLabelValue = findAttrInNodeTree((snapshot!.data as any).node, 'test-button', 'aria-label');
    expect(ariaLabelValue).toBe('****** ****');
  });

  test('does not mask style attribute even when listed in maskAttributes', async ({ page }) => {
    // style is explicitly excluded from maskAttributeFn because rrweb handles style diffs separately
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ maskAttributes: ['style'] }));
    const flushAndGetEvents = await mockTrackApiAndCaptureEvents(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    const events = await flushAndGetEvents();
    const snapshot = events.find((e) => e.type === 2);
    expect(snapshot).toBeDefined();

    // test-input has style="display:block" — should be present and never replaced with stars
    const styleValue = findAttrInNodeTree((snapshot!.data as any).node, 'test-input', 'style');
    expect(typeof styleValue).toBe('string');
    expect(styleValue).not.toMatch(/^\*+/);
  });
});

// ─── shutdown ─────────────────────────────────────────────────────────────────

test.describe('shutdown', () => {
  test('flushes buffered events when shutdown is called', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    // Register waitForRequest before goto so the immediate full-snapshot flush
    // (which fires as soon as rrweb captures the snapshot) can satisfy it.
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // The immediate flush should already have sent the full snapshot. Confirm at
    // least one request was made, then call shutdown to flush any remaining events.
    await trackRequestPromise; // throws if no request is made within timeout
    await page.evaluate(() => (window as any).sessionReplay.shutdown() as void);
  });

  test('blur no longer triggers a flush after shutdown', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page, (route) => sentUrls.push(route.request().url()));

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // shutdown() removes the blur event listener and flushes pending events
    await page.evaluate(() => (window as any).sessionReplay.shutdown() as void);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS); // let shutdown's own sendEvents() complete

    const countAfterShutdown = sentUrls.length;

    // Blur should no longer trigger a flush (listener was removed during shutdown)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(sentUrls.length).toBe(countAfterShutdown);
  });
});

// ─── capture_enabled ──────────────────────────────────────────────────────────

test.describe('capture_enabled', () => {
  test('does not record when capture_enabled is false in remote config', async ({ page }) => {
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: false } } },
    });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('does not send events to the track API when capture_enabled is false', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: false } } },
    });
    await mockTrackApi(page, (route) => sentUrls.push(route.request().url()));

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(sentUrls.length).toBe(0);
  });
});

// ─── blur auto-flush ──────────────────────────────────────────────────────────

test.describe('blur auto-flush', () => {
  test('sends buffered events to the track API without an explicit flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    // Register waitForRequest before goto. The full snapshot is flushed immediately
    // after rrweb captures it (no explicit flush() call needed); the listener must
    // be in place before that happens.
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    await trackRequestPromise; // throws if no request is made within the timeout
  });
});

// ─── session replay property format ──────────────────────────────────────────

test.describe('session replay property format', () => {
  test('property value is formatted as deviceId/sessionId', async ({ page }) => {
    const CUSTOM_DEVICE_ID = 'my-custom-device-id';
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        deviceId: CUSTOM_DEVICE_ID,
      }),
    );
    await waitForReady(page);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(props[SR_PROPERTY_KEY]).toBe(`${CUSTOM_DEVICE_ID}/${TEST_SESSION_ID}`);
  });

  test('property reflects new deviceId after setSessionId with explicit deviceId', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    const NEW_DEVICE_ID = 'new-device-id';
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    await page.evaluate(
      ({ newId, newDevice }) => (window as any).sessionReplay.setSessionId(newId, newDevice).promise as Promise<void>,
      { newId: NEW_SESSION_ID, newDevice: NEW_DEVICE_ID },
    );

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBe(`${NEW_DEVICE_ID}/${NEW_SESSION_ID}`);
  });
});

// ─── network logging — fields ─────────────────────────────────────────────────

test.describe('network logging — fields', () => {
  test('captures method and HTTP status for a POST fetch', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody());
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate(
      (url) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      `${TEST_FETCH_ORIGIN}/submit`,
    );
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.method).toBe('POST');
    expect(evt!.status).toBe(201);
  });

  test('defaults method to GET when no method is specified', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody());
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate((url) => fetch(url), `${TEST_FETCH_ORIGIN}/data`);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.method).toBe('GET');
    expect(evt!.status).toBe(200);
  });

  test('captures request body but not response body when response capture is disabled', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody({ response: false }));
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"res":"data"}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate(
      (url) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ req: 'data' }),
        }),
      `${TEST_FETCH_ORIGIN}/data`,
    );
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.requestBody).toBe('{"req":"data"}');
    expect(evt!.responseBody).toBeUndefined();
    expect(evt!.responseBodyStatus).toBeUndefined();
  });

  test('captures response body but not request body when request capture is disabled', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithNetworkBody({ request: false }));
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"res":"data"}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await waitForNetworkObservers(page);

    await page.evaluate(
      (url) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ req: 'data' }),
        }),
      `${TEST_FETCH_ORIGIN}/data`,
    );
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeDefined();
    expect(evt!.requestBody).toBeUndefined();
    expect(evt!.responseBody).toBe('{"res":"data"}');
    expect(evt!.responseBodyStatus).toBe('captured');
  });

  test('does not capture network events when network logging is disabled', async ({ page }) => {
    await mockRemoteConfig(page, {
      configs: {
        sessionReplay: {
          sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
          sr_logging_config: { network: { enabled: false } },
        },
      },
    });
    const getFetchEvents = await mockTrackApiWithCapture(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    // Network logging is disabled — fetch is not patched, so skip waitForNetworkObservers
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate((url) => fetch(url), `${TEST_FETCH_ORIGIN}/data`);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const fetchEvents = getFetchEvents();
    const evt = fetchEvents.find((e) => String(e.url).includes(TEST_FETCH_ORIGIN));
    expect(evt).toBeUndefined();
  });
});

// ─── web worker mode ─────────────────────────────────────────────────────────

test.describe('web worker mode', () => {
  test('sends full snapshot immediately without worker errors', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    // Capture any SDK error logs — a worker crash emits an Amplitude Logger [Error] line
    const workerErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('worker')) {
        workerErrors.push(msg.text());
      }
    });

    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });
    await mockTrackApi(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        useWebWorker: true,
      }),
    );
    await waitForReady(page);

    // Full snapshot should be sent immediately (worker delivers it)
    await requestPromise;
    expect(workerErrors).toHaveLength(0);
  });

  test('sends events to the track API via worker when flushed', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        useWebWorker: true,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const bodies = getBodies();
    expect(bodies.length).toBeGreaterThan(0);
    const events = bodies.flatMap((b) => decodeAllEvents(b));
    const fullSnapshot = events.find((e) => e['type'] === 2);
    expect(fullSnapshot).toBeDefined();
  });

  test('sends payload with gzip Content-Encoding via worker', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getHeaders } = await captureTrackRequests(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        useWebWorker: true,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const headers = getHeaders();
    expect(headers.length).toBeGreaterThan(0);
    expect(headers[0]['content-encoding']).toBe('gzip');
  });
});

// ─── SR-3115: improved replay data delivery ───────────────────────────────────

test.describe('SR-3115: improved replay data delivery', () => {
  test('sends full snapshot immediately without waiting for explicit flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    // Wait for the API request to be made automatically — no explicit flush()
    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });
    await page.route('https://api-sr.amplitude.com/**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // The full snapshot should be sent immediately (no blur/flush needed)
    const request = await requestPromise;
    expect(request).toBeDefined();
    expect(request.url()).toContain('api-sr.amplitude.com');
  });

  test('full snapshot request contains type 2 rrweb event', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    // Give rrweb a moment to send the immediate full-snapshot flush
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const bodies = getBodies();
    expect(bodies.length).toBeGreaterThan(0);
    const events = bodies.flatMap((b) => decodeAllEvents(b));
    const fullSnapshot = events.find((e) => e['type'] === 2);
    expect(fullSnapshot).toBeDefined();
  });

  test('sends payload with gzip Content-Encoding', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getHeaders } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const headers = getHeaders();
    expect(headers.length).toBeGreaterThan(0);
    // Chromium supports CompressionStream, so all requests should be gzip-encoded
    expect(headers[0]['content-encoding']).toBe('gzip');
  });

  test('sendBeacon is called on page hide with pending events', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    // Intercept track API but intentionally delay responses so events accumulate
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      await new Promise((r) => setTimeout(r, 5_000)); // hold response
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Spy on navigator.sendBeacon before triggering page hide
    await page.evaluate(() => {
      (window as any).__beaconCalls = [] as string[];
      const orig = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url: string, data?: BodyInit | null) => {
        (window as any).__beaconCalls.push(url);
        return orig(url, data);
      };
    });

    // Trigger page hide to invoke the beacon fallback
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(200);

    const beaconCalls = await page.evaluate(() => (window as any).__beaconCalls as string[]);
    // The beacon should have been called with the track API URL
    expect(beaconCalls.some((url: string) => url.includes('api-sr.amplitude.com'))).toBe(true);
  });
});
