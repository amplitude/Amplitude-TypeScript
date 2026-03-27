import { test, expect } from '@playwright/test';
import {
  SR_API_SUCCESS,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
} from './helpers';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';

// xxHash32('1719847315013') % 1_000_000 / 1_000_000 = 0.109684
// In 20% sample (0.2 > 0.1097), NOT in 10% sample (0.1 < 0.1097)
const SESSION_ID_IN_20_SAMPLE = 1719847315013;

function mockTrackApi(page: import('@playwright/test').Page) {
  return page.route('https://api-sr.amplitude.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
  );
}

// ─── Sampling header ──────────────────────────────────────────────────────────

test.describe('sampling hash algorithm header', () => {
  test('sends X-Sampling-Hash-Alg: xxhash32 header on track API requests', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.route('https://api-sr.amplitude.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
    );

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('api-sr.amplitude.com') && req.method() === 'POST',
      { timeout: 10_000 },
    );
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);

    const request = await requestPromise;
    expect(request.headers()['x-sampling-hash-alg']).toBe('xxhash32');
  });
});

// ─── xxHash32 sample rate decisions ──────────────────────────────────────────

test.describe('xxHash32 sampling decisions', () => {
  test('records session when sample rate is above hash ratio', async ({ page }) => {
    // SESSION_ID_IN_20_SAMPLE has ratio ~0.1097, so 20% sample rate includes it
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.2 } } },
    });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);

    const props = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    expect(props[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(props[SR_PROPERTY_KEY])).toContain(`/${SESSION_ID_IN_20_SAMPLE}`);
  });

  test('does not record session when sample rate is below hash ratio', async ({ page }) => {
    // SESSION_ID_IN_20_SAMPLE has ratio ~0.1097, so 10% sample rate excludes it
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.1 } } },
    });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);

    const props = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();
  });

  test('does not send events to track API when session is excluded by sample rate', async ({ page }) => {
    const getRawBodies = await captureTrackRequests(page);
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.1 } } },
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);
    await flushRecording(page);

    expect(getRawBodies().length).toBe(0);
  });

  test('sends events to track API when session is included by sample rate', async ({ page }) => {
    const getRawBodies = await captureTrackRequests(page);
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.2 } } },
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    expect(getRawBodies().length).toBeGreaterThan(0);
  });

  test('sampling decision is deterministic — same session ID always gets same result', async ({ page }) => {
    await mockRemoteConfig(page, {
      configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 0.2 } } },
    });
    await mockTrackApi(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: SESSION_ID_IN_20_SAMPLE }));
    await waitForReady(page);

    const props1 = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    const props2 = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );

    expect(props1[SR_PROPERTY_KEY]).toBe(props2[SR_PROPERTY_KEY]);
  });
});
