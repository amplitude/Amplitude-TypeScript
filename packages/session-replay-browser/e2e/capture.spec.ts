import { test, expect, Route } from '@playwright/test';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';
const TEST_SESSION_ID = 1700000000000; // fixed timestamp always in sample at 100%
const SR_API_SUCCESS = { code: 200 };

// Remote config responses. The key 'configs.sessionReplay' is traversed as a
// dot-separated path by the RemoteConfigClient, so the response must be nested.
const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};
const remoteConfigNotRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.0 } } },
};
const remoteConfigOptOut = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

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

function mockRemoteConfig(page: import('@playwright/test').Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

function mockTrackApi(page: import('@playwright/test').Page, onRequest?: (route: Route) => void) {
  return page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    onRequest?.(route);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
}

function buildUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs.toString()}`;
}

async function waitForReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, { timeout: 10_000 });
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
    await mockRemoteConfig(page, remoteConfigOptOut);
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
    await page.waitForTimeout(500);

    // Blur moves buffered rrweb events from the store into trackDestination; flush sends them
    await page.evaluate(() => window.dispatchEvent(new Event('blur')) as unknown as void);
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(500);

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
    await page.waitForTimeout(500);

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

    await page.evaluate((newId) => (window as any).sessionReplay.setSessionId(newId) as Promise<void>, NEW_SESSION_ID);

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
    await page.waitForTimeout(500);

    // waitForRequest verifies that events were actually flushed to the API
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 5_000 });
    await page.evaluate((newId) => (window as any).sessionReplay.setSessionId(newId) as Promise<void>, NEW_SESSION_ID);
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
    await page.waitForTimeout(500);

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

  test('continues recording after navigating away from matched URL (monotonic match)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithUrlTargeting(MATCH_STRING));
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);

    // Verify recording started on the matching URL
    const propsBefore = await getProperties(page);
    expect(propsBefore[SR_PROPERTY_KEY]).toBeTruthy();

    // Navigate away to a non-matching URL
    await page.evaluate(() => history.pushState({}, '', '/some-other-route'));
    await page.waitForTimeout(500);

    // Should still be recording — targeting match is monotonic within a session
    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });
});
