/**
 * End-to-end tests for the customer-facing start() / stop() recording APIs.
 *
 * These drive a real page + real rrweb (not a mocked record()). The goal is to
 * prove that stop() actually cancels the rrweb recorder: DOM mutations after
 * stop() never appear in the track payload, and start() begins a new recording.
 */

import { test, expect, Page } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
} from './helpers';

const SR_PROPERTY_KEY = '[Amplitude] Session Replay ID';
const MUTATION_SOURCE = 0; // IncrementalSource.Mutation
const EVENT_INCREMENTAL_SNAPSHOT = 3;

function gotoCapturePage(page: Page) {
  return page.goto(
    buildUrl('/session-replay-browser/sr-capture-test.html', {
      sessionId: TEST_SESSION_ID,
      // Opt into eager send + on-focus full snapshot so drain/flush is deterministic.
      eagerFullSnapshotSend: true,
      captureFullSnapshotOnFocus: true,
    }),
  );
}

async function appendMarker(page: Page, id: string): Promise<void> {
  await page.evaluate((markerId) => {
    document.body.appendChild(Object.assign(document.createElement('div'), { id: markerId }));
  }, id);
}

async function drainAndFlush(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

function bodiesContainMarker(rawBodies: string[], markerId: string): boolean {
  return rawBodies.some((body) => body.includes(markerId));
}

function decodeMutationAdds(rawBodies: string[]): string[] {
  const ids: string[] = [];
  for (const body of rawBodies) {
    if (!body) continue;
    let payload: { events?: unknown[] };
    try {
      payload = JSON.parse(body) as { events?: unknown[] };
    } catch {
      continue;
    }
    if (!Array.isArray(payload.events)) continue;
    for (const eventStr of payload.events) {
      if (typeof eventStr !== 'string') continue;
      try {
        const event = JSON.parse(eventStr) as {
          type: number;
          data: { source: number; adds?: Array<{ node?: { attributes?: Record<string, string> } }> };
        };
        if (event.type === EVENT_INCREMENTAL_SNAPSHOT && event.data.source === MUTATION_SOURCE) {
          for (const add of event.data.adds ?? []) {
            const id = add.node?.attributes?.id;
            if (id) ids.push(id);
          }
        }
      } catch {
        // skip unparseable
      }
    }
  }
  return ids;
}

test.describe('start and stop', () => {
  test('stop() cancels rrweb so later DOM mutations are not captured', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await gotoCapturePage(page);
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await appendMarker(page, 'sr-before-stop');
    await drainAndFlush(page);

    expect(decodeMutationAdds(getBodies())).toContain('sr-before-stop');

    await page.evaluate(() => (window as any).sessionReplay.stop() as void);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await appendMarker(page, 'sr-after-stop');
    // Focus must not restart the recorder after stop().
    await drainAndFlush(page);

    expect(bodiesContainMarker(getBodies(), 'sr-after-stop')).toBe(false);
    expect(decodeMutationAdds(getBodies())).not.toContain('sr-after-stop');
  });

  test('start() resumes rrweb capture after stop()', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await gotoCapturePage(page);
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => (window as any).sessionReplay.stop() as void);
    await appendMarker(page, 'sr-while-stopped');
    await drainAndFlush(page);
    expect(bodiesContainMarker(getBodies(), 'sr-while-stopped')).toBe(false);

    await page.evaluate(() => (window as any).sessionReplay.start().promise as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await appendMarker(page, 'sr-after-start');
    await drainAndFlush(page);

    expect(decodeMutationAdds(getBodies())).toContain('sr-after-start');
    // The node added while stopped may appear in a later full snapshot of the live DOM,
    // but it must never have been captured as an incremental mutation.
    expect(decodeMutationAdds(getBodies())).not.toContain('sr-while-stopped');
  });

  test('stop() clears session replay properties until start()', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await captureTrackRequests(page);

    await gotoCapturePage(page);
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const recordingProps = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    expect(recordingProps[SR_PROPERTY_KEY]).toBeTruthy();

    await page.evaluate(() => (window as any).sessionReplay.stop() as void);
    const stoppedProps = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    expect(stoppedProps[SR_PROPERTY_KEY]).toBeFalsy();

    await page.evaluate(() => (window as any).sessionReplay.start().promise as Promise<void>);
    const resumedProps = await page.evaluate(
      () => (window as any).sessionReplay.getSessionReplayProperties() as Record<string, unknown>,
    );
    expect(resumedProps[SR_PROPERTY_KEY]).toBeTruthy();
  });
});
