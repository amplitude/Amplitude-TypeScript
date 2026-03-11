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
