import { test, expect } from '@playwright/test';
import {
  SNAPSHOT_SETTLE_MS,
  TEST_SESSION_ID,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  mockRemoteConfig,
} from './helpers';

/**
 * E2E tests for Targeted Recording Config (TRC) URL-rule enforcement.
 *
 * Scenario 1 — Happy path: fresh state, network returns URL-filtered TRC config.
 *   - Non-matching URL → no recording.
 *   - SPA navigation to matching URL → recording starts.
 *
 * Scenario 2 — Stale-cache behavior with the SR-4234 fix:
 *   joined-config now subscribes with { timeout } delivery mode, so the SDK waits for the
 *   remote response and uses it when it arrives. Stale localStorage no longer wins the
 *   Promise.race in 'all' mode — that race is gone. Two cases here:
 *     • Live network → SDK uses the fresh remote config, recording does NOT start on the
 *       non-matching URL (this is the bug the fix closes).
 *     • Blocked network → SDK waits out the timeout and falls back to the stale cache,
 *       so recording still starts incorrectly. Cache TTL / fail-closed targeting are the
 *       defense-in-depth follow-ups that close this last gap.
 */

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';
const TEST_PAGE = '/session-replay-browser/sr-capture-test.html';

// API key used by sr-capture-test.html
const TEST_API_KEY = 'd90c5cf09ca2546a1626272906b99a76';
// localStorage cache key = 'AMP_remote_config_' + apiKey.substring(0, 10)
const CACHE_LS_KEY = `AMP_remote_config_${TEST_API_KEY.substring(0, 10)}`;

// Remote config that captures ONLY when URL contains /should-capture.
// Default segment is 0% (off).
function remoteConfigWithTrcUrlRule() {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 0.0 },
        sr_targeting_config: {
          key: 'sr_targeting_config',
          variants: { on: { key: 'on' }, off: { key: 'off' } },
          segments: [
            {
              metadata: { segmentName: 'Should capture' },
              bucket: {
                selector: ['context', 'session_id'],
                salt: 'trc_test_salt',
                allocations: [
                  {
                    range: [0, 100],
                    distributions: [{ variant: 'on', range: [0, 42949673] }],
                  },
                ],
              },
              conditions: [[{ selector: ['context', 'page', 'url'], op: 'contains', values: ['/should-capture'] }]],
            },
            {
              bucket: {
                selector: ['context', 'session_id'],
                salt: 'trc_default_salt',
                allocations: [
                  {
                    range: [0, 100],
                    distributions: [{ variant: 'on', range: [0, 0] }],
                  },
                ],
              },
              metadata: { segmentName: 'default random sample', segmentId: '__internal_random_sample__' },
            },
            { variant: 'off' },
          ],
        },
      },
    },
  };
}

// Stale remote config that captures everywhere (no URL condition, 100% rate).
function staleRemoteConfigCaptureEverywhere() {
  return {
    remoteConfig: {
      configs: {
        sessionReplay: {
          sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
          sr_targeting_config: {
            key: 'sr_targeting_config',
            variants: { on: { key: 'on' }, off: { key: 'off' } },
            segments: [
              {
                metadata: { segmentName: 'capture_everywhere' },
                bucket: {
                  selector: ['context', 'session_id'],
                  salt: 'stale_salt',
                  allocations: [
                    {
                      range: [0, 100],
                      distributions: [{ variant: 'on', range: [0, 42949672] }],
                    },
                  ],
                },
              },
              { variant: 'off' },
            ],
          },
        },
      },
    },
    lastFetch: new Date(Date.now() - 60_000).toISOString(),
  };
}

async function seedStaleCache(page: import('@playwright/test').Page) {
  await page.addInitScript(
    (args: { key: string; value: string }) => {
      localStorage.setItem(args.key, args.value);
    },
    { key: CACHE_LS_KEY, value: JSON.stringify(staleRemoteConfigCaptureEverywhere()) },
  );
}

async function getProperties(page: import('@playwright/test').Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>);
}

function mockTrackApi(page: import('@playwright/test').Page) {
  return page.route('https://api-sr.amplitude.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) }),
  );
}

// ─── Scenario 1: Happy path (fresh state, TRC URL rule mocked) ───────────────

test.describe('TRC URL rule — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigWithTrcUrlRule());
    await mockTrackApi(page);
  });

  test('does not record on a non-matching URL', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(TEST_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const props = await getProperties(page);
    expect(props[SR_PROPERTY_KEY]).toBeFalsy();

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(getBodies().length).toBe(0);
  });

  test('starts recording after SPA navigation to a matching URL', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(TEST_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect((await getProperties(page))[SR_PROPERTY_KEY]).toBeFalsy();

    await page.evaluate(() => history.pushState({}, '', '/should-capture'));

    await page.waitForFunction(
      (key) => !!(window as any).sessionReplay.getSessionReplayProperties()[key],
      SR_PROPERTY_KEY,
      { timeout: 10_000 },
    );

    const propsAfter = await getProperties(page);
    expect(propsAfter[SR_PROPERTY_KEY]).toBeTruthy();
    expect(String(propsAfter[SR_PROPERTY_KEY])).toContain(`/${TEST_SESSION_ID}`);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(getBodies().length).toBeGreaterThan(0);
  });
});

// ─── Scenario 2: Stale-cache bug repro ───────────────────────────────────────

test.describe('TRC URL rule — stale localStorage cache', () => {
  test.setTimeout(30_000);

  test('stale cache causes recording on non-matching URL when network is blocked (bug: SDK records when it should not)', async ({
    page,
  }) => {
    await seedStaleCache(page);

    // Block the remote-config fetch entirely so the stale cache is the only input
    // to joined-config. This simulates an adblocker / CSP / network failure —
    // the real-world condition under which this bug manifested at Qonto.
    await page.route('https://sr-client-cfg.amplitude.com/**', (route) => route.abort());

    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(TEST_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const props = await getProperties(page);
    const isRecording = !!props[SR_PROPERTY_KEY];

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // After SR-4234: joined-config now subscribes with { timeout } delivery mode, so a
    // blocked network causes the SDK to wait out the timeout and then fall back to the
    // (stale) cache. Recording then starts based on the stale config — the fix here is
    // partial: it prevents the live-network case from regressing, but a blocked network
    // with a stale cache still records against the old config. Defense-in-depth follow-ups
    // (TTL on cache, fail-closed targeting default) tracked separately.
    //
    // IMPORTANT: when the cache TTL / fail-closed work lands, BOTH of the assertions below
    // must flip to `false` / `0`. Test will silently start failing otherwise.
    expect(isRecording).toBe(true);
    expect(getBodies().length).toBeGreaterThan(0);
  });

  test('stale cache with live network: documents whether SDK self-corrects within the same session', async ({
    page,
  }) => {
    await seedStaleCache(page);

    // Allow the network to respond with the correct URL-filtered TRC config.
    // In 'all' mode, joined-config resolves on the FIRST callback — so if the
    // cache fires before the network response arrives, the session is already
    // initialised with stale data. The network response only updates the cache
    // for the NEXT session.
    await mockRemoteConfig(page, remoteConfigWithTrcUrlRule());
    await mockTrackApi(page);

    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(TEST_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    // Give time for the network response to arrive and be processed.
    await page.waitForTimeout(3_000);

    const props = await getProperties(page);
    const isRecording = !!props[SR_PROPERTY_KEY];

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // SR-4234 fixed: with { timeout } delivery mode, joined-config waits for the remote
    // response and uses it instead of the stale cache. The fresh config excludes this URL,
    // so the SDK does not record this session.
    expect(isRecording).toBe(false);
    expect(getBodies().length).toBe(0);
  });
});
