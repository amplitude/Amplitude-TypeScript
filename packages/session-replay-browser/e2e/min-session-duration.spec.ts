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

    test('a session that ends below the threshold uploads nothing', async ({ page }) => {
      const { getBodies } = await openPage(page, storeType);
      await typeFor(page, MIN_SESSION_DURATION_MS - 1500);
      await flushRecording(page);
      expect(getBodies()).toEqual([]);
    });
  });
}
