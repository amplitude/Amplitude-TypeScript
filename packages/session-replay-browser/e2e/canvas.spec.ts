import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
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
 * HTML examples under test-server/session-replay-browser/canvas/.
 * Each page passes a different `canvas` local config through to rrweb.
 */
const COMMANDS_PAGE = '/session-replay-browser/canvas/commands.html';
const SNAPSHOTS_PAGE = '/session-replay-browser/canvas/snapshots.html';
const WEBGL_PAGE = '/session-replay-browser/canvas/webgl.html';

const EVENT_INCREMENTAL = 3;
const SOURCE_CANVAS_MUTATION = 9;

type CanvasCommand = { property?: string };
type RrwebEvent = {
  type?: number;
  data?: {
    source?: number;
    commands?: CanvasCommand[];
    property?: string;
  };
};

type SrWindow = Window & {
  srError?: string;
  drawMore?: () => void;
  drawTriangle?: () => boolean;
  webglUnavailable?: boolean;
};

function decodeEvents(rawBodies: string[]): RrwebEvent[] {
  return rawBodies.flatMap((rawBody) => {
    if (!rawBody) return [];
    try {
      const payload = JSON.parse(rawBody) as { events?: unknown[] };
      if (!Array.isArray(payload.events)) return [];
      return payload.events.flatMap((eventStr) => {
        if (typeof eventStr !== 'string') return [];
        try {
          return [JSON.parse(eventStr) as RrwebEvent];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  });
}

function canvasMutations(rawBodies: string[]): RrwebEvent[] {
  return decodeEvents(rawBodies).filter(
    (event) => event.type === EVENT_INCREMENTAL && event.data?.source === SOURCE_CANVAS_MUTATION,
  );
}

function commandProperties(event: RrwebEvent): string[] {
  const commands = event.data?.commands ?? [];
  const fromList = commands.map((command) => command.property).filter((property): property is string => !!property);
  return event.data?.property ? [...fromList, event.data.property] : fromList;
}

test.describe('canvas record option', () => {
  test.beforeEach(async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
  });

  test('records 2D drawing commands when canvas sampling is all', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(COMMANDS_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    expect(await page.evaluate(() => (window as SrWindow).srError)).toBeUndefined();

    await flushRecording(page);
    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();
    const canvasNode = root ? findById(root, 'demo') : undefined;
    expect(canvasNode?.attributes?.rr_dataURL).toEqual(expect.stringContaining('data:image/'));

    // 2D hooks emit on a timeout, then rrweb flushes the queued commands on the next frame.
    await expect
      .poll(async () => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              (window as SrWindow).drawMore?.();
              setTimeout(() => requestAnimationFrame(() => resolve()), 0);
            }),
        );
        await flushRecording(page);
        return canvasMutations(getBodies()).flatMap(commandProperties);
      })
      .toEqual(expect.arrayContaining(['fillRect']));
  });

  test('does not record canvas pixels when canvas.enabled is false', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(COMMANDS_PAGE, { sessionId: TEST_SESSION_ID, canvasEnabled: 'false' }));
    await waitForReady(page);
    expect(await page.evaluate(() => (window as SrWindow).srError)).toBeUndefined();

    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          (window as SrWindow).drawMore?.();
          setTimeout(() => requestAnimationFrame(() => resolve()), 0);
        }),
    );
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();
    const canvasNode = root ? findById(root, 'demo') : undefined;
    expect(canvasNode).toBeDefined();
    expect(canvasNode?.attributes?.rr_dataURL).toBeUndefined();
    expect(canvasMutations(getBodies())).toEqual([]);
  });

  test('records canvas image snapshots when sampling is a frame rate', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(SNAPSHOTS_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    expect(await page.evaluate(() => (window as SrWindow).srError)).toBeUndefined();

    await expect
      .poll(async () => {
        await flushRecording(page);
        const root = getSnapshotRoot(getBodies());
        const canvasNode = root ? findById(root, 'demo') : undefined;
        const snapshotImage = canvasNode?.attributes?.rr_dataURL;
        const drewImage = canvasMutations(getBodies()).some((event) => commandProperties(event).includes('drawImage'));
        return typeof snapshotImage === 'string' && snapshotImage.startsWith('data:image/webp') && drewImage;
      })
      .toBe(true);
  });

  test('records WebGL drawing commands', async ({ page }) => {
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl(WEBGL_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    expect(await page.evaluate(() => (window as SrWindow).srError)).toBeUndefined();
    test.skip(await page.evaluate(() => (window as SrWindow).webglUnavailable === true), 'WebGL is unavailable');

    // WebGL hooks queue commands that rrweb emits on the next animation frame.
    await expect
      .poll(async () => {
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              (window as SrWindow).drawTriangle?.();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            }),
        );
        await flushRecording(page);
        return canvasMutations(getBodies()).flatMap(commandProperties);
      })
      .toEqual(expect.arrayContaining(['drawArrays']));
  });
});
