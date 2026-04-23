import { test, expect, Route, Page } from '@playwright/test';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';
const TEST_SESSION_ID = 1700000000000;
const SR_API_SUCCESS = { code: 200 };

// Amplitude Experiment eval URL — intercepted by Playwright
const REMOTE_EVAL_URL = 'https://api.lab.amplitude.com/sdk/v2/vardata**';

const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

function mockRemoteConfig(page: Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

function mockTrackApi(page: Page) {
  return page.route('https://api-sr.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
  );
}

function mockRemoteEval(page: Page, response: { capture: boolean; reason?: string }) {
  const flagKey = 'sr-capture-gate';
  const variantKey = response.capture ? 'on' : 'off';
  const body = { [flagKey]: { key: variantKey, value: variantKey } };
  return page.route(REMOTE_EVAL_URL, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

function buildUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs.toString()}`;
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, { timeout: 10_000 });
}

async function getProperties(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>);
}

/** Base URL params for a page with remote eval configured */
function remoteEvalParams(
  strategy: 'conservative' | 'lookback',
  extra: Record<string, string | number | boolean> = {},
) {
  return {
    sessionId: TEST_SESSION_ID,
    remoteEvalDeploymentKey: 'client-test-key',
    remoteEvalStrategy: strategy,
    remoteEvalTimeoutMs: 2000,
    ...extra,
  };
}

// ─── Conservative strategy ────────────────────────────────────────────────────

test.describe('remote eval gate — conservative strategy', () => {
  test('records when remote eval returns capture=true', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);
    await mockRemoteEval(page, { capture: true });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // Wait for the remote decision to arrive and recording to start
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('does not record when remote eval returns capture=false', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);
    await mockRemoteEval(page, { capture: false, reason: 'not in cohort' });

    // Register before navigation to avoid race where request fires before listener is set up
    const evalRequestPromise = page.waitForRequest(REMOTE_EVAL_URL, { timeout: 5_000 });
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);
    await evalRequestPromise;
    await page.waitForTimeout(300);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('does not record before remote decision arrives (no premature capture)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    // Hold the remote eval response until we manually release it
    let releaseDecision!: () => void;
    await page.route(REMOTE_EVAL_URL, (route: Route) => {
      releaseDecision = () => {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 'sr-capture-gate': { key: 'on', value: 'on' } }),
        });
      };
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // Decision hasn't arrived yet — should not be recording
    const propsBefore = await getProperties(page);
    expect(propsBefore[SR_PROPERTY_KEY]).toBeFalsy();

    // Release the decision
    releaseDecision();

    // Now recording should start
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
  });

  test('does not record when remote eval times out (conservative fallback)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    // Never fulfill the remote eval request — simulates a timeout
    await page.route(REMOTE_EVAL_URL, () => {
      // intentionally stall — the SDK's AbortController will fire after timeoutMs
    });

    await page.goto(
      buildUrl(
        '/session-replay-browser/sr-capture-test.html',
        remoteEvalParams('conservative', {
          remoteEvalTimeoutMs: 200,
        }),
      ),
    );
    await waitForReady(page);

    // Wait long enough for the SDK timeout to fire
    await page.waitForTimeout(600);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('sends events to track API after conservative capture=true', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
      sentUrls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });
    await mockRemoteEval(page, { capture: true });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // Wait for recording to start
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );
    await page.waitForTimeout(500);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(500);

    expect(sentUrls.length).toBeGreaterThan(0);
  });

  test('does not send events to track API after conservative capture=false', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
      sentUrls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });
    await mockRemoteEval(page, { capture: false });

    // Register before navigation to avoid race where request fires before listener is set up
    const evalRequestPromise = page.waitForRequest(REMOTE_EVAL_URL, { timeout: 5_000 });
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);
    await evalRequestPromise;
    await page.waitForTimeout(300);

    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(500);

    expect(sentUrls.length).toBe(0);
  });
});

// ─── Lookback strategy ────────────────────────────────────────────────────────

test.describe('remote eval gate — lookback strategy', () => {
  test('begins recording immediately (before decision) and flushes events on capture=true', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
      sentUrls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    let releaseDecision!: () => void;
    await page.route(REMOTE_EVAL_URL, (route: Route) => {
      releaseDecision = () => {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 'sr-capture-gate': { key: 'on', value: 'on' } }),
        });
      };
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('lookback')));
    await waitForReady(page);

    // Give rrweb time to capture an initial snapshot while decision is pending
    await page.waitForTimeout(500);

    // Release decision — held events should be flushed
    const trackRequestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 5_000 });
    releaseDecision();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await trackRequestPromise;

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);
  });

  test('discards buffered events and stops recording on capture=false', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
      sentUrls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });
    await mockRemoteEval(page, { capture: false, reason: 'excluded' });

    // Register before navigation to avoid race where request fires before listener is set up
    const evalRequestPromise = page.waitForRequest(REMOTE_EVAL_URL, { timeout: 5_000 });
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('lookback')));
    await waitForReady(page);
    await evalRequestPromise;
    await page.waitForTimeout(300);

    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(500);

    // SR property should be absent — capture denied
    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
    // No events should have been sent to the track API
    expect(sentUrls.length).toBe(0);
  });
});

// ─── Session change ───────────────────────────────────────────────────────────

test.describe('remote eval gate — session ID change', () => {
  const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;

  test('re-runs remote eval on setSessionId and records when capture=true', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);
    await mockRemoteEval(page, { capture: true });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // Wait for initial remote eval + recording
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );

    // Switch session — remote eval fires again for the new session
    await page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );

    // Wait for new session remote eval to complete
    await page.waitForFunction(
      (args) => {
        const props = (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>;
        return typeof props[args.key] === 'string' && (props[args.key] as string).includes(`/${args.id}`);
      },
      { key: SR_PROPERTY_KEY, id: NEW_SESSION_ID },
      { timeout: 5_000 },
    );

    const props = await getProperties(page);
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${NEW_SESSION_ID}`);
  });

  test('does not record new session when remote eval returns capture=false on session change', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    let callCount = 0;
    await page.route(REMOTE_EVAL_URL, (route: Route) => {
      callCount++;
      // First call (init): allow capture. Second call (session change): deny.
      const variantKey = callCount === 1 ? 'on' : 'off';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 'sr-capture-gate': { key: variantKey, value: variantKey } }),
      });
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // First session: should record
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 5_000 },
    );
    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeTruthy();

    // Switch session — second remote eval returns capture=false
    await page.evaluate(
      (newId) => (window as any).sessionReplay.setSessionId(newId).promise as Promise<void>,
      NEW_SESSION_ID,
    );
    await page.waitForTimeout(500);

    // New session should not be recording
    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });
});

// ─── Remote eval request shape ────────────────────────────────────────────────

test.describe('remote eval gate — request shape', () => {
  test('sends correct flag_key and device_id as query params to Amplitude eval API', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApi(page);

    let capturedUrl: string | undefined;
    await page.route(REMOTE_EVAL_URL, (route: Route) => {
      capturedUrl = route.request().url();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 'my-sr-flag': { key: 'on', value: 'on' } }),
      });
    });

    // Register before navigation to avoid race where request fires before listener is set up
    const evalRequestPromise = page.waitForRequest(REMOTE_EVAL_URL, { timeout: 5_000 });
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        ...remoteEvalParams('conservative'),
        remoteEvalFlagKey: 'my-sr-flag',
        deviceId: 'e2e-device-001',
      }),
    );
    await waitForReady(page);
    await evalRequestPromise;

    expect(capturedUrl).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const url = new URL(capturedUrl!);
    expect(url.searchParams.get('flag_keys')).toBe('my-sr-flag');
    expect(url.searchParams.get('device_id')).toBe('e2e-device-001');
  });
});
