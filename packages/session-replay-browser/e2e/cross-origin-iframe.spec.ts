import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
  getSnapshotRoot,
  findById,
} from './helpers';

const PARENT_PAGE = '/session-replay-browser/sr-cross-origin-iframe-parent.html';
const CHILD_PAGE = '/session-replay-browser/sr-cross-origin-iframe-child.html';

/** Wait for the child iframe to appear and return the matching Playwright Frame. */
async function getChildFrame(page: import('@playwright/test').Page) {
  await page.waitForSelector('#child-frame');
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
  const childFrame = page.frames().find((f) => f.url().includes('sr-cross-origin-iframe-child'));
  if (!childFrame) throw new Error('Child frame not found');
  return childFrame;
}

test.describe('cross-origin iframe recording', () => {
  test.beforeEach(async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
  });

  test('parent initializes without error with crossOriginIframes enabled', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(PARENT_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    const srError = await page.evaluate(() => (window as any).srError as string | undefined);
    expect(srError).toBeUndefined();

    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(getBodies().length).toBeGreaterThan(0);
    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();
    expect(findById(root!, 'parent-content')).toBeDefined();
  });

  test('coordinator sends start signal to dynamically-added child iframe', async ({ page }) => {
    await captureTrackRequests(page);

    await page.goto(buildUrl(PARENT_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    const childFrame = await getChildFrame(page);

    // The child's raw onmessage listener (set before the SDK loads) must have
    // received the start postMessage from the parent's CrossOriginIframeCoordinator.
    const receivedStart = await childFrame.evaluate(() => (window as any).receivedStartSignal as boolean);
    expect(receivedStart).toBe(true);
  });

  test('child page detects it is inside an iframe', async ({ page }) => {
    await captureTrackRequests(page);

    await page.goto(buildUrl(PARENT_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    const childFrame = await getChildFrame(page);

    const childModeDetected = await childFrame.evaluate(() => (window as any).childModeDetected as boolean);
    expect(childModeDetected).toBe(true);
  });

  test('coordinateChildren: false — child iframe does not receive start signal', async ({ page }) => {
    await captureTrackRequests(page);

    await page.goto(buildUrl(PARENT_PAGE, { sessionId: TEST_SESSION_ID, coordinateChildren: 'false' }));
    await waitForReady(page);

    const childFrame = await getChildFrame(page);

    // No start signal expected: coordinator is not started when coordinateChildren=false.
    const receivedStart = await childFrame.evaluate(() => (window as any).receivedStartSignal as boolean);
    expect(receivedStart).toBe(false);
  });

  test('child page initializes without error when loaded directly (not in an iframe)', async ({ page }) => {
    await captureTrackRequests(page);

    await page.goto(buildUrl(CHILD_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    const srError = await page.evaluate(() => (window as any).srError as string | undefined);
    expect(srError).toBeUndefined();

    // Not in an iframe context, so child mode should not be detected.
    const childModeDetected = await page.evaluate(() => (window as any).childModeDetected as boolean);
    expect(childModeDetected).toBe(false);
  });
});
