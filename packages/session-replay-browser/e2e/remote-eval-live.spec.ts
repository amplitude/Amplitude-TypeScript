/**
 * Live e2e tests for the remote eval gate against the real Amplitude Experiment API.
 *
 * Flag:       sr-capture-gate (id: 902007)
 *             Targeting: $region IS "North Carolina" → 100% "on"
 *             Default rollout: 0% (falls through to "off" for non-matching users)
 * Project:    Lew Shutdown Test (631773)
 * Deployment: lew-sr-test-client (32512)
 *
 * These tests do NOT mock the Amplitude eval endpoint — requests go to
 * https://api.lab.amplitude.com/sdk/v2/vardata for real.
 *
 * Each test fires a lightweight analytics event to api2.amplitude.com so that
 * Amplitude can geo-enrich and build a user profile for the device in this project.
 * This is required for property-based Experiment targeting to work. Note that
 * profile propagation to Experiment takes ~1 hour after the first event lands.
 */

import { test, expect, Route, Page } from '@playwright/test';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';

// Real client deployment key for project 631773, flag sr-capture-gate
const DEPLOYMENT_KEY = 'client-cp9bqxFcxFAKoaYEBeCD1n3TW8enG0Xh';

// A known device ID that already has an amplitude_id mapping in project 631773.
// Using a UUID-format device_id is required for SR ingestion to accept events.
const LIVE_DEVICE_ID = 'a9ea9629-5dca-4908-a86c-77a5acfbd54a';

const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

function mockRemoteConfig(page: Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
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

function remoteEvalParams(
  strategy: 'conservative' | 'lookback',
  extra: Record<string, string | number | boolean> = {},
) {
  return {
    // Use a real current timestamp so the SR service accepts the events.
    sessionId: Date.now(),
    // Use a UUID-format device_id with an existing amplitude_id mapping so SR ingestion accepts events.
    deviceId: LIVE_DEVICE_ID,
    remoteEvalDeploymentKey: DEPLOYMENT_KEY,
    remoteEvalStrategy: strategy,
    remoteEvalTimeoutMs: 5000,
    // Fire a real analytics event on each test run so Amplitude geo-enriches the
    // device and populates user properties (e.g. $region) needed for flag targeting.
    sendAnalyticsEvent: true,
    ...extra,
  };
}

test.describe('remote eval gate — live Amplitude Experiment API', () => {
  test('conservative: records when live flag evaluates to "on"', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    // Flag is 100% on — recording should start once decision arrives
    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 10_000 },
    );

    // Give rrweb time to capture an initial snapshot, then flush and wait for the
    // response so the request fully completes before Playwright closes the page.
    await page.waitForTimeout(500);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForResponse('https://api-sr.amplitude.com/**', { timeout: 15_000 });

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
  });

  test('lookback: records and flushes events when live flag evaluates to "on"', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('lookback')));
    await waitForReady(page);

    // Wait for the eval request to complete before triggering flush — in lookback mode,
    // SR_PROPERTY_KEY appears immediately (decision not required), so we must wait for the
    // actual decision before blurring, otherwise the buffer hasn't been flushed yet.
    await page.waitForResponse('https://api.lab.amplitude.com/**', { timeout: 10_000 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    // Wait for the full SR response so the request completes before Playwright closes the page.
    await page.waitForResponse('https://api-sr.amplitude.com/**', { timeout: 15_000 });

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
  });

  test('sends the deployment key in the Authorization header', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => route.fulfill({ status: 200 }));

    let capturedAuthHeader: string | undefined;
    await page.route('https://api.lab.amplitude.com/**', async (route: Route) => {
      capturedAuthHeader = route.request().headers()['authorization'];
      // Let the real request through after capturing the header
      await route.continue();
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', remoteEvalParams('conservative')));
    await waitForReady(page);

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 10_000 },
    );

    expect(capturedAuthHeader).toBe(`Api-Key ${DEPLOYMENT_KEY}`);
  });

  test('sends flag_key and device_id as query params', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route: Route) => route.fulfill({ status: 200 }));

    let capturedUrl: string | undefined;
    await page.route('https://api.lab.amplitude.com/**', async (route: Route) => {
      capturedUrl = route.request().url();
      await route.continue();
    });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        ...remoteEvalParams('conservative'),
        deviceId: 'live-e2e-device-001',
      }),
    );
    await waitForReady(page);

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 10_000 },
    );

    expect(capturedUrl).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const url = new URL(capturedUrl!);
    expect(url.searchParams.get('flag_keys')).toBe('sr-capture-gate');
    expect(url.searchParams.get('device_id')).toBe('live-e2e-device-001');
  });
});
