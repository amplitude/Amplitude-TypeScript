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
// Fake origin used for fetch calls made from the child iframe.
const TEST_FETCH_ORIGIN = 'https://test-fetch.amplitude.test';

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

  // SR-5883: custom events (e.g. network) carried debug config containing functions
  // (loggerProvider), so the child's rrweb postMessage to the parent threw DataCloneError.
  test('network event from a real cross-origin child reaches the parent', async ({ page, baseURL }) => {
    await page.unrouteAll();
    await mockRemoteConfig(page, {
      configs: {
        sessionReplay: {
          sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
          sr_logging_config: { network: { enabled: true, body: { request: true, response: true } } },
        },
      },
    });
    await captureTrackRequests(page);
    await page.route(`${TEST_FETCH_ORIGIN}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'iframe-response-body' }),
      }),
    );
    // Record every rrweb message the parent window receives from the child.
    await page.addInitScript(() => {
      if (window !== window.top) return;
      (window as any).childRrwebEvents = [];
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'rrweb') (window as any).childRrwebEvents.push(e.data.event);
      });
    });

    // localhost vs 127.0.0.1 makes the child a genuinely different origin.
    const crossOrigin = new URL(baseURL!);
    crossOrigin.hostname = crossOrigin.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    await page.goto(
      buildUrl(PARENT_PAGE, { sessionId: TEST_SESSION_ID, childSrc: new URL(CHILD_PAGE, crossOrigin).toString() }),
    );
    await waitForReady(page);

    // getChildFrame() matches by path, which the parent URL also contains via childSrc.
    await page.waitForSelector('#child-frame');
    await expect.poll(() => page.frames().some((f) => f.url().startsWith(crossOrigin.origin))).toBe(true);
    const childFrame = page.frames().find((f) => f.url().startsWith(crossOrigin.origin))!;
    await childFrame.waitForFunction(() => (window as any).srReady === true, undefined, { timeout: 10_000 });
    await childFrame.waitForFunction(() => !window.fetch.toString().includes('[native code]'), undefined, {
      timeout: 10_000,
    });

    // The coordinator sends a single start signal on iframe load, which can beat the child
    // SDK's async listener registration. Re-send it until the child's full snapshot (DOM
    // recording) reaches the parent; a duplicate start just restarts child recording.
    await expect
      .poll(() =>
        page.evaluate(() => {
          (document.getElementById('child-frame') as HTMLIFrameElement).contentWindow!.postMessage(
            { type: 'amplitude-sr-iframe', action: 'start' },
            '*',
          );
          return ((window as any).childRrwebEvents as Array<{ type: number }>).some((e) => e.type === 2);
        }),
      )
      .toBe(true);

    await childFrame.evaluate(
      (url) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'iframe-request-body' }),
        }),
      `${TEST_FETCH_ORIGIN}/replay-network-check`,
    );

    await expect
      .poll(() =>
        page.evaluate(() =>
          ((window as any).childRrwebEvents as Array<{ type: number; data?: { tag?: string } }>).find(
            (e) => e.type === 5 && e.data?.tag === 'fetch-request',
          ),
        ),
      )
      .toMatchObject({
        data: {
          payload: {
            url: `${TEST_FETCH_ORIGIN}/replay-network-check`,
            requestBody: '{"action":"iframe-request-body"}',
            responseBody: '{"result":"iframe-response-body"}',
          },
        },
      });
  });
});
