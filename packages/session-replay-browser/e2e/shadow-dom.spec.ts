import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  getSnapshotRoot,
  findById,
  flushRecording,
} from './helpers';

/**
 * E2E tests for captureAdoptedStyleSheets option.
 *
 * These tests verify that:
 *   1. The option is accepted by the SDK without error (both true and false).
 *   2. Shadow DOM elements are captured in the full snapshot regardless of the option value.
 *
 * Full inline-stylesheet assertion (verifying adoptedStyleSheets CSS rules appear
 * inline in the snapshot node rather than as incremental events) requires an rrweb
 * version that includes amplitude/rrweb#101. That assertion should be added here
 * once the @amplitude/rrweb-* packages are bumped to include that fix.
 */

const SHADOW_DOM_PAGE = '/session-replay-browser/sr-shadow-dom-test.html';

type SrWindow = Window & { srError?: string };

test.describe('captureAdoptedStyleSheets option', () => {
  test.beforeEach(async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
  });

  test('SDK initializes without error and captures shadow host with default (true)', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(SHADOW_DOM_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    // Verify no initialization error
    const srError = await page.evaluate(() => (window as SrWindow).srError);
    expect(srError).toBeUndefined();

    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // The shadow host div must appear in the snapshot
    const shadowHost = findById(root!, 'shadow-host');
    expect(shadowHost).toBeDefined();
    // Shadow root childNodes are serialized as children of the host
    expect((shadowHost?.childNodes ?? []).length).toBeGreaterThan(0);
  });

  test('SDK initializes without error and captures shadow host with captureAdoptedStyleSheets=false', async ({
    page,
  }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(
      buildUrl(SHADOW_DOM_PAGE, {
        sessionId: TEST_SESSION_ID,
        captureAdoptedStyleSheets: 'false',
      }),
    );
    await waitForReady(page);

    // Verify no initialization error when opting out
    const srError = await page.evaluate(() => (window as SrWindow).srError);
    expect(srError).toBeUndefined();

    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const shadowHost = findById(root!, 'shadow-host');
    expect(shadowHost).toBeDefined();
    expect((shadowHost?.childNodes ?? []).length).toBeGreaterThan(0);
  });
});
