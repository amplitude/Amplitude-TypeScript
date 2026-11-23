import { test, expect, Page, Route } from '@playwright/test';
import {
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
  readRouteBody,
  SR_API_SUCCESS,
} from './helpers';

type RrwebEvent = { type: number; timestamp: number };
type SessionReplayWindow = { sessionReplay: { setSessionId: (id: number) => { promise: Promise<void> } } };
const EVENT_META = 4;
const EVENT_FULL_SNAPSHOT = 2;
const MIN_SESSION_DURATION_MS = 3000;

function decodeEvents(bodies: string[]): RrwebEvent[] {
  return bodies
    .flatMap((body) => {
      try {
        return (JSON.parse(body) as { events: string[] }).events.map((e) => JSON.parse(e) as RrwebEvent);
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Pass null for a config with no min_session_duration_ms. */
function samplingConfig(minSessionDurationMs: number | null = MIN_SESSION_DURATION_MS) {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: {
          capture_enabled: true,
          sample_rate: 1.0,
          ...(minSessionDurationMs !== null ? { min_session_duration_ms: minSessionDurationMs } : {}),
        },
      },
    },
  };
}

async function openPage(page: Page, storeType: 'memory' | 'idb', sessionId = Date.now()) {
  await mockRemoteConfig(page, samplingConfig());
  const capture = await captureTrackRequests(page);
  await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId, storeType }));
  await waitForReady(page);
  return capture;
}

/** Track requests keyed by the session_id query param, so a test can tell sessions apart. */
async function captureTrackRequestsBySession(page: Page) {
  const bySession = new Map<string, string[]>();
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    const sessionId = new URL(route.request().url()).searchParams.get('session_id') ?? 'unknown';
    bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), readRouteBody(route)]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return (sessionId: number) => bySession.get(String(sessionId)) ?? [];
}

/** Stubs sendBeacon, fires pagehide, and returns the beacon bodies sent on page leave. */
async function leavePage(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    const w = window as unknown as { __beaconBodies: Promise<string>[] };
    w.__beaconBodies = [];
    navigator.sendBeacon = (_url: string | URL, data?: BodyInit | null) => {
      w.__beaconBodies.push(new Response(data).text());
      return true;
    };
    window.dispatchEvent(new Event('pagehide'));
  });
  return page.evaluate(() => Promise.all((window as unknown as { __beaconBodies: Promise<string>[] }).__beaconBodies));
}

/** Waits for the upload to land, then checks it is a complete replay: Meta first, full snapshot included. */
async function expectCompleteReplay(getBodies: () => string[]) {
  await expect.poll(() => decodeEvents(getBodies()).length, { timeout: 5000 }).toBeGreaterThan(0);
  const events = decodeEvents(getBodies());
  expect(events[0].type).toBe(EVENT_META);
  expect(events.some((e) => e.type === EVENT_FULL_SNAPSHOT)).toBe(true);
}

async function typeFor(page: Page, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 250) {
    await page.locator('#test-input').type('a');
    await page.waitForTimeout(250);
  }
}

for (const storeType of ['memory', 'idb'] as const) {
  test.describe(`min_session_duration_ms (${storeType} store)`, () => {
    test('a session that passes the threshold uploads from its first event, full snapshot included', async ({
      page,
    }) => {
      const { getBodies } = await openPage(page, storeType);
      // Long enough for the store to split several batches while the gate is closed.
      await typeFor(page, MIN_SESSION_DURATION_MS + 2000);
      await flushRecording(page);

      await expectCompleteReplay(getBodies);
    });

    test('a session that passes the threshold while idle sends its full snapshot in the page-leave beacon', async ({
      page,
    }) => {
      await openPage(page, storeType);
      // Activity while gated, so batches are split off and held...
      await typeFor(page, MIN_SESSION_DURATION_MS - 1000);
      // ...then pass the threshold with no further events, so nothing releases them.
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const w = window as unknown as { __beaconBodies: Promise<string>[] };
        w.__beaconBodies = [];
        navigator.sendBeacon = (_url: string | URL, data?: BodyInit | null) => {
          w.__beaconBodies.push(new Response(data).text());
          return true;
        };
        window.dispatchEvent(new Event('pagehide'));
      });
      const beaconBodies = await page.evaluate(() =>
        Promise.all((window as unknown as { __beaconBodies: Promise<string>[] }).__beaconBodies),
      );

      const events = decodeEvents(beaconBodies);
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EVENT_META);
      expect(events.some((e) => e.type === EVENT_FULL_SNAPSHOT)).toBe(true);
    });

    test('a session that ends below the threshold uploads nothing', async ({ page }) => {
      const { getBodies } = await openPage(page, storeType);
      await typeFor(page, MIN_SESSION_DURATION_MS - 1500);
      await flushRecording(page);
      expect(getBodies()).toEqual([]);
    });

    test('a session that leaves below the threshold sends nothing in the page-leave beacon', async ({ page }) => {
      const { getBodies } = await openPage(page, storeType);
      await typeFor(page, MIN_SESSION_DURATION_MS - 1500);
      expect(await leavePage(page)).toEqual([]);
      expect(getBodies()).toEqual([]);
    });

    test('a reload keeps the clock running: time before and after the reload adds up', async ({ page }) => {
      const sessionId = Date.now();
      const { getBodies } = await openPage(page, storeType, sessionId);
      // Below the threshold on each side of the reload, above it combined.
      await typeFor(page, MIN_SESSION_DURATION_MS - 1000);
      const stored = await page.evaluate(
        (id) => Object.keys(localStorage).filter((k) => k.startsWith('AMP_SR_START_') && k.endsWith(`_${id}`)),
        sessionId,
      );
      expect(stored).toHaveLength(1);
      await page.reload();
      await waitForReady(page);
      await typeFor(page, 2000);
      await flushRecording(page);
      await expectCompleteReplay(getBodies);
    });

    test('a short session that is replaced is dropped; the next session uploads on its own', async ({ page }) => {
      const firstSessionId = Date.now();
      const secondSessionId = firstSessionId + 1;
      await mockRemoteConfig(page, samplingConfig());
      const getBodiesFor = await captureTrackRequestsBySession(page);
      await page.goto(
        buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: firstSessionId, storeType }),
      );
      await waitForReady(page);

      await typeFor(page, 1000);
      await page.evaluate(
        (id) => (window as unknown as SessionReplayWindow).sessionReplay.setSessionId(id).promise,
        secondSessionId,
      );
      await typeFor(page, MIN_SESSION_DURATION_MS + 1000);
      await flushRecording(page);

      expect(getBodiesFor(firstSessionId)).toEqual([]);
      await expectCompleteReplay(() => getBodiesFor(secondSessionId));
    });

    test('a session that passed the threshold still uploads after it is replaced by a short one', async ({ page }) => {
      const firstSessionId = Date.now();
      const secondSessionId = firstSessionId + 1;
      await mockRemoteConfig(page, samplingConfig());
      const getBodiesFor = await captureTrackRequestsBySession(page);
      await page.goto(
        buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: firstSessionId, storeType }),
      );
      await waitForReady(page);

      await typeFor(page, MIN_SESSION_DURATION_MS + 1000);
      await page.evaluate(
        (id) => (window as unknown as SessionReplayWindow).sessionReplay.setSessionId(id).promise,
        secondSessionId,
      );
      await typeFor(page, 1000);
      await flushRecording(page);

      await expectCompleteReplay(() => getBodiesFor(firstSessionId));
      expect(getBodiesFor(secondSessionId)).toEqual([]);
    });
  });
}

test.describe('min_session_duration_ms configuration', () => {
  test('without a threshold, a short session uploads right away', async ({ page }) => {
    await mockRemoteConfig(page, samplingConfig(null));
    const { getBodies } = await captureTrackRequests(page);
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: Date.now() }));
    await waitForReady(page);
    await typeFor(page, 1000);
    await flushRecording(page);
    await expectCompleteReplay(getBodies);
  });

  test('a threshold above 60 seconds is capped at 60 seconds', async ({ page }) => {
    test.setTimeout(120_000);
    await mockRemoteConfig(page, samplingConfig(10 * 60_000));
    const { getBodies } = await captureTrackRequests(page);
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: Date.now() }));
    await waitForReady(page);

    await typeFor(page, 2000);
    await flushRecording(page);
    expect(getBodies()).toEqual([]);

    // Uncapped, this session would hold its replay for 10 minutes.
    await page.waitForTimeout(60_000);
    await typeFor(page, 1000);
    await flushRecording(page);
    await expectCompleteReplay(getBodies);
  });
});

// With targeted replay capture, the clock starts when the session matches and starts
// recording, not when the session starts.
test.describe('min_session_duration_ms with targeted replay capture', () => {
  const remoteConfig = {
    configs: {
      sessionReplay: {
        sr_sampling_config: {
          capture_enabled: true,
          sample_rate: 0.0,
          min_session_duration_ms: MIN_SESSION_DURATION_MS,
        },
        // Captures only once the URL contains /should-capture.
        sr_targeting_config: {
          key: 'sr_targeting_config',
          variants: { on: { key: 'on' }, off: { key: 'off' } },
          segments: [
            {
              metadata: { segmentName: 'Should capture' },
              bucket: {
                selector: ['context', 'session_id'],
                salt: 'trc_test_salt',
                allocations: [{ range: [0, 100], distributions: [{ variant: 'on', range: [0, 42949673] }] }],
              },
              conditions: [[{ selector: ['context', 'page', 'url'], op: 'contains', values: ['/should-capture'] }]],
            },
            { variant: 'off' },
          ],
        },
      },
    },
  };

  async function openTrcPage(page: Page) {
    await mockRemoteConfig(page, remoteConfig);
    const capture = await captureTrackRequests(page);
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: Date.now() }));
    await waitForReady(page);
    return capture;
  }

  test('measures the threshold from when the session matches, not from session start', async ({ page }) => {
    const { getBodies } = await openTrcPage(page);

    // The session is already past the threshold when it matches.
    await page.waitForTimeout(MIN_SESSION_DURATION_MS + 1000);
    await page.evaluate(() => history.pushState({}, '', '/should-capture'));

    // Recording, but not yet for the threshold: nothing is uploaded.
    await typeFor(page, MIN_SESSION_DURATION_MS - 1500);
    await flushRecording(page);
    expect(getBodies()).toEqual([]);

    // Past the threshold since the match: the replay uploads from its first event.
    await typeFor(page, 2500);
    await flushRecording(page);
    await expectCompleteReplay(getBodies);
  });

  test('a session that matches and leaves before the threshold uploads nothing', async ({ page }) => {
    const { getBodies } = await openTrcPage(page);
    await page.waitForTimeout(MIN_SESSION_DURATION_MS + 1000);
    await page.evaluate(() => history.pushState({}, '', '/should-capture'));
    await typeFor(page, MIN_SESSION_DURATION_MS - 1500);
    expect(await leavePage(page)).toEqual([]);
    expect(getBodies()).toEqual([]);
  });

  test('a session that never matches uploads nothing, however long it runs', async ({ page }) => {
    const { getBodies } = await openTrcPage(page);
    await typeFor(page, MIN_SESSION_DURATION_MS + 2000);
    await flushRecording(page);
    expect(await leavePage(page)).toEqual([]);
    expect(getBodies()).toEqual([]);
  });
});
