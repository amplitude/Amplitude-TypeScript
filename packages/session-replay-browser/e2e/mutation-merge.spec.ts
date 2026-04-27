/**
 * End-to-end tests for the mutation-merge feature (SR-3752).
 *
 * DRAIN STRATEGY
 * ──────────────
 * The EventCompressor routes non-snapshot events through a pendingQueue that
 * is processed (merged) only by two paths:
 *   1. An idle-callback call to processQueue()
 *   2. A FullSnapshot event, which synchronously drains pendingQueue via
 *      mergeMutationTasks() before emitting the snapshot.
 *
 * Relying on path 1 is inherently timing-sensitive: requestIdleCallback can
 * fire between Playwright evaluate() calls (during the ~2 ms CDP roundtrip),
 * splitting events into separate merge windows.  All tests here instead
 * trigger a focus event — which causes the SDK to take a FullSnapshot — to
 * reliably flush pendingQueue through the merge path before calling flush().
 *
 * MO BATCH NOTES
 * ──────────────
 * Mutations made synchronously within a single evaluate() call all land in
 * one MutationObserver batch → one rrweb event.  Tests that exercise the
 * multi-event merge path (cross-batch) use separate evaluate() calls so MO
 * fires between them.  The pre-existing-transient test is intentionally
 * structured with separate calls and is proven correct for any timing split
 * of the three events.
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

const MUTATION_SOURCE = 0; // IncrementalSource.Mutation
const EVENT_INCREMENTAL_SNAPSHOT = 3;

interface RrwebAdd {
  parentId: number;
  nextId: number | null;
  node: {
    id: number;
    attributes?: Record<string, string>;
    [key: string]: unknown;
  };
}

interface RrwebRemove {
  parentId: number;
  id: number;
}

interface MutationData {
  source: number;
  adds: RrwebAdd[];
  removes: RrwebRemove[];
  texts: unknown[];
  attributes: unknown[];
}

function decodeMutationEvents(rawBodies: string[]): MutationData[] {
  const results: MutationData[] = [];
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
        const event = JSON.parse(eventStr) as { type: number; data: MutationData };
        if (event.type === EVENT_INCREMENTAL_SNAPSHOT && event.data.source === MUTATION_SOURCE) {
          results.push(event.data);
        }
      } catch {
        // skip unparseable
      }
    }
  }
  return results;
}

/**
 * Triggers a window focus event, causing the SDK to take a FullSnapshot.
 * The FullSnapshot path in EventCompressor synchronously drains pendingQueue
 * through mergeMutationTasks(), so all pending mutation events are processed
 * (and merged) before this call returns.
 */
async function drainPendingMutations(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

async function flushAndCapture(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

// ─── mutation merge — SR-3752 ──────────────────────────────────────────────────

test.describe('mutation merge', () => {
  /**
   * Basic capture smoke test: multiple synchronous DOM mutations (one MO batch →
   * one rrweb event) are captured and delivered to the track API.
   */
  test('captures synchronous DOM mutations and delivers them to the API', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // All three mutations are synchronous → one MO batch → one rrweb event.
    await page.evaluate(() => {
      document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mm-node-1' }));
      document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mm-node-2' }));
      document.body.appendChild(Object.assign(document.createElement('div'), { id: 'mm-node-3' }));
    });

    await drainPendingMutations(page);
    await flushAndCapture(page);

    const allAdds = decodeMutationEvents(getBodies()).flatMap((e) => e.adds);

    expect(allAdds.some((a) => a.node.attributes?.id === 'mm-node-1')).toBe(true);
    expect(allAdds.some((a) => a.node.attributes?.id === 'mm-node-2')).toBe(true);
    expect(allAdds.some((a) => a.node.attributes?.id === 'mm-node-3')).toBe(true);
  });

  /**
   * A node added and removed within the same MO batch is purely transient.
   * rrweb's own mutation handler elides same-batch transient nodes, so no add
   * or remove for the node should appear in the captured events.
   */
  test('elides transient node added and removed in the same MO batch', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Synchronous add then remove → same MO batch; rrweb sees net zero for this node.
    await page.evaluate(() => {
      const el = Object.assign(document.createElement('div'), { id: 'mm-transient' });
      document.body.appendChild(el);
      document.body.removeChild(el);
    });

    await drainPendingMutations(page);
    await flushAndCapture(page);

    const mutationEvents = decodeMutationEvents(getBodies());
    const allAdds = mutationEvents.flatMap((e) => e.adds);
    const allRemoves = mutationEvents.flatMap((e) => e.removes);

    // Transient node must not appear in adds or removes.
    expect(allAdds.some((a) => a.node.attributes?.id === 'mm-transient')).toBe(false);
    // No other mutations occurred; removes should be empty too.
    expect(allRemoves).toHaveLength(0);
  });

  /**
   * A pre-existing DOM node (present in the initial full snapshot) that is
   * removed, re-added, then removed again: our merge code should cancel the
   * re-add cycle while preserving the original removal.
   *
   * This test uses three separate evaluate() calls so that each mutation lands
   * in its own MO batch (→ separate rrweb events), exercising the cross-event
   * merge path.
   *
   * requestIdleCallback is frozen before the mutations so that all three events
   * accumulate in pendingQueue rather than being split across multiple merge
   * windows by the idle scheduler firing between evaluate() calls.
   * drainPendingMutations then flushes the complete window via the FullSnapshot
   * path, which synchronously merges all three events together.
   */
  test('preserves pre-existing node original removal when re-add is cancelled', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Freeze idle processing so all three mutation events accumulate in
    // pendingQueue and are merged together by drainPendingMutations below.
    // Without this, requestIdleCallback can fire in the ~2 ms CDP gap between
    // evaluate() calls, processing events 1+2 as a partial window and
    // misclassifying test-input as "ultimately present".
    await page.evaluate(() => {
      window.requestIdleCallback = () => 0;
    });

    // Stash a reference to the pre-existing element so it survives removal from the DOM.
    await page.evaluate(() => {
      (window as any).__preEl = document.getElementById('test-input') as HTMLElement;
      document.body.removeChild((window as any).__preEl as Node); // original remove
    });
    await page.evaluate(() => {
      document.body.appendChild((window as any).__preEl as Node);
    }); // re-add
    await page.evaluate(() => {
      document.body.removeChild((window as any).__preEl as Node);
    }); // final remove

    // drainPendingMutations triggers a FullSnapshot which synchronously flushes
    // pendingQueue through mergeMutationTasks(), merging the three events.
    await drainPendingMutations(page);
    await flushAndCapture(page);

    const mutationEvents = decodeMutationEvents(getBodies());
    const allAdds = mutationEvents.flatMap((e) => e.adds);
    const allRemoves = mutationEvents.flatMap((e) => e.removes);

    // The re-add should be cancelled — test-input must not appear in any adds.
    expect(allAdds.some((a) => a.node.attributes?.id === 'test-input')).toBe(false);
    // The original removal should be preserved — exactly one remove entry.
    expect(allRemoves).toHaveLength(1);
  });

  /**
   * A DOM move (remove from one parent, add under a different parent) is not
   * a transient operation: both the remove and the re-add must be preserved so
   * the replayer can reproduce the move.
   */
  test('preserves DOM moves (remove from one parent, add under another)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // All mutations synchronous → one MO batch → one rrweb event containing
    // both the new container (add) and the moved node (remove + add).
    await page.evaluate(() => {
      const container = Object.assign(document.createElement('div'), { id: 'mm-move-target' });
      document.body.appendChild(container);
      const el = document.getElementById('test-input') as HTMLElement;
      document.body.removeChild(el);
      container.appendChild(el);
    });

    await drainPendingMutations(page);
    await flushAndCapture(page);

    const mutationEvents = decodeMutationEvents(getBodies());
    const allAdds = mutationEvents.flatMap((e) => e.adds);
    const allRemoves = mutationEvents.flatMap((e) => e.removes);

    // New container should be in adds.
    expect(allAdds.some((a) => a.node.attributes?.id === 'mm-move-target')).toBe(true);
    // Moved node should appear in both adds (new location) and removes (old location).
    expect(allAdds.some((a) => a.node.attributes?.id === 'test-input')).toBe(true);
    expect(allRemoves.length).toBeGreaterThanOrEqual(1);
  });
});
