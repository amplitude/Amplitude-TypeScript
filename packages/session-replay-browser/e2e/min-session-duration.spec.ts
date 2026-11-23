import { test, expect, Page } from '@playwright/test';
import { mockRemoteConfig, buildUrl, waitForReady, captureTrackRequests, flushRecording } from './helpers';

type RrwebEvent = { type: number; timestamp: number };
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

async function openPage(page: Page, storeType: 'memory' | 'idb') {
  await mockRemoteConfig(page, {
    configs: {
      sessionReplay: {
        sr_sampling_config: {
          capture_enabled: true,
          sample_rate: 1.0,
          min_session_duration_ms: MIN_SESSION_DURATION_MS,
        },
      },
    },
  });
  const capture = await captureTrackRequests(page);
  await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: Date.now(), storeType }));
  await waitForReady(page);
  return capture;
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

      const events = decodeEvents(getBodies());
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe(EVENT_META);
      expect(events.some((e) => e.type === EVENT_FULL_SNAPSHOT)).toBe(true);
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
  });
}

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

  test('measures the threshold from when the session matches, not from session start', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfig);
    const { getBodies } = await captureTrackRequests(page);
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: Date.now() }));
    await waitForReady(page);

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
    const events = decodeEvents(getBodies());
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe(EVENT_META);
    expect(events.some((e) => e.type === EVENT_FULL_SNAPSHOT)).toBe(true);
  });
});
