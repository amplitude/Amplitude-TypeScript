import { test, expect, Page } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  getSnapshotRoot,
} from './helpers';

// A flush interval far larger than any test window. With it set, the ONLY thing that can
// produce a network request during the assertion window is the eager full-snapshot send
// (or an explicit blur/flush). This removes interval-driven sends as a source of flake so
// the tests isolate the behavior of the `eagerFullSnapshotSend` / size config options.
const HIGH_FLUSH = { flushMinIntervalMs: 60_000, flushMaxIntervalMs: 60_000 } as const;

async function flush(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

async function fireFocus(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
  }
}

// ─── eagerFullSnapshotSend ────────────────────────────────────────────────────

test.describe('eagerFullSnapshotSend config', () => {
  test('defaults to true: the initial full snapshot is sent immediately, no flush needed', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    // High flush interval so a request here can only come from the eager full-snapshot path.
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID, ...HIGH_FLUSH }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(getBodies().length).toBeGreaterThan(0);
    expect(getSnapshotRoot(getBodies())).not.toBeNull();
  });

  test('false: the initial full snapshot is buffered and only delivered on a later flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        eagerFullSnapshotSend: false,
        ...HIGH_FLUSH,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // No eager send and no interval send → nothing on the wire yet.
    expect(getBodies()).toHaveLength(0);

    // The snapshot was buffered all along, so an explicit flush still delivers it intact.
    await flush(page);
    expect(getBodies().length).toBeGreaterThan(0);
    expect(getSnapshotRoot(getBodies())).not.toBeNull();
  });

  test('false: repeated focus events do NOT each trigger a request (request-storm guard)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        eagerFullSnapshotSend: false,
        ...HIGH_FLUSH,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    expect(getBodies()).toHaveLength(0);

    // Each focus makes rrweb take a fresh full snapshot. With eager send disabled these are
    // buffered, not transmitted — so the focus-driven request storm cannot occur.
    await fireFocus(page, 5);
    expect(getBodies()).toHaveLength(0);

    // Everything buffered is still delivered on the next real flush.
    await flush(page);
    expect(getBodies().length).toBeGreaterThan(0);
  });

  test('true (default): repeated focus events each trigger an immediate request', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID, ...HIGH_FLUSH }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const afterInit = getBodies().length;
    expect(afterInit).toBeGreaterThan(0); // eager initial snapshot

    // With eager send on, each focus-driven full snapshot is flushed immediately — this is the
    // multiplication that becomes a storm when many SDK instances share a page.
    await fireFocus(page, 3);
    expect(getBodies().length).toBeGreaterThan(afterInit);
  });
});
