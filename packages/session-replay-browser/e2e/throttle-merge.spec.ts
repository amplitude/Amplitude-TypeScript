import { test, expect, Page, Route } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  readRouteBody,
  bodyContainsInDecodedEvents,
} from './helpers';

/**
 * Mocks the track API with a flag-driven response. While `throttle.value === true`, every
 * 200 carries the X-Session-Replay-Event-Skipped: 429 header (server-side throttle signal).
 * Toggling false has subsequent calls return clean 200s.
 *
 * Captures the bodies of *fetch* POSTs only — sendBeacon payloads use `version: 2` and are
 * filtered out so beacon traffic (which bypasses trackDestination's queue and the pause)
 * doesn't pollute the assertions about post-throttle merge behavior.
 */
async function mockTrackApiWithToggleableThrottle(
  page: Page,
): Promise<{ getFetchBodies: () => string[]; throttle: { value: boolean } }> {
  const fetchBodies: string[] = [];
  const throttle = { value: true };
  await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    const body = readRouteBody(route);
    // sendBeacon payloads are tagged version: 2 and bypass trackDestination's queue;
    // trackDestination fetch payloads are version: 1. The merge logic only applies to
    // the fetch path, so beacon traffic is filtered out of the assertion stream.
    let isFetchPath = true;
    try {
      const parsed = JSON.parse(body) as { version?: number };
      if (parsed.version === 2) isFetchPath = false;
    } catch {
      // Non-JSON body — treat as fetch path (defensive; shouldn't happen in practice).
    }
    if (isFetchPath) fetchBodies.push(body);
    // Echo origin for the credentialed CORS preflight; `*` is rejected when the request
    // carries credentials, which Chrome does for SR's Authorization-bearing fetches.
    const requestOrigin = route.request().headers()['origin'] ?? '*';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Credentials': 'true',
      // Without exposing this header, the browser strips it from the page-visible
      // response and the SDK can't read the throttle directive.
      'Access-Control-Expose-Headers': 'X-Session-Replay-Event-Skipped',
    };
    if (throttle.value) {
      headers['X-Session-Replay-Event-Skipped'] = '429';
    }
    return route.fulfill({ status: 200, headers, body: 'success' });
  });
  return { getFetchBodies: () => fetchBodies, throttle };
}

/**
 * Continuously generates DOM mutations and pointer events for `durationMs`, embedding the
 * marker text in the input value. The mutations flow through rrweb → eventCompressor →
 * events store, and time-based sequence splits (MIN_INTERVAL=500ms, growing) push completed
 * sequences into trackDestination.queue via addToQueue. We avoid `pagehide`/`blur` entirely
 * because pagehide triggers `sendBeacon` (which bypasses the throttle pause), and blur fails
 * to drain the eventCompressor's idle queue.
 */
async function continuousActivity(page: Page, marker: string, durationMs: number): Promise<void> {
  await page.evaluate(
    ({ tag, ms }) => {
      // Add a marker div with the .amp-unmask class so the marker text survives SR's
      // input-masking privacy filter (which would otherwise replace the text with
      // asterisks and erase any per-cycle distinction). Each cycle appends its own
      // marker as a fresh DOM mutation event, so the merged POST body contains all
      // three when coalescing worked.
      const markerDiv = document.createElement('div');
      markerDiv.className = 'amp-unmask';
      markerDiv.textContent = tag;
      markerDiv.id = `marker-div-${tag}`;
      document.body.appendChild(markerDiv);

      return new Promise<void>((resolve) => {
        const start = Date.now();
        let i = 0;
        const tick = () => {
          if (Date.now() - start >= ms) return resolve();
          const input = document.getElementById('test-input') as HTMLInputElement | null;
          if (input) {
            // Input values are masked but the events still flow through rrweb, so we
            // get the time-based sequence splits we need.
            input.value = `iter-${i++}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.getElementById('test-button')?.click();
          // ~20 mutations/sec — fast enough to keep events flowing through every
          // sequence-split interval, but light enough to be deterministic.
          setTimeout(tick, 50);
        };
        tick();
      });
    },
    { tag: marker, ms: durationMs },
  );
}

test.describe('post-throttle release merges queued sends (SR-4286)', () => {
  test('multiple sequences enqueued during the throttle pause collapse into one POST on manual flush', async ({
    page,
  }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getFetchBodies, throttle } = await mockTrackApiWithToggleableThrottle(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    // Generous settle window: rrweb captures the full snapshot, the metadata/debug-info
    // events flow through eventCompressor's idle queue, and the first natural sequence
    // split fires. Each fetch POST during this window gets the throttle header, so by
    // the time we leave this stage, flushPauseUntilMs is set ~60s ahead.
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 4);
    const baseline = getFetchBodies().length;
    expect(baseline).toBeGreaterThan(0);

    // Drive ~3 seconds of continuous activity with three distinct markers. The events
    // flow naturally into the events store; the time-based split logic
    // (MIN_INTERVAL=500ms, growing) creates multiple sequence boundaries → multiple
    // addToQueue calls. addToQueue→schedule(0) sees the pause and defers (60s) +
    // sets mergeOnNextFlush. The first call schedules the timer; subsequent
    // addToQueues just append to the queue (the early-return on `if (this.scheduled)`).
    await continuousActivity(page, 'marker-A', 1000);
    await continuousActivity(page, 'marker-B', 1000);
    await continuousActivity(page, 'marker-C', 1000);

    // Nothing new should have been sent during the pause — the deferred timer is 60s out.
    expect(getFetchBodies().length).toBe(baseline);

    // Flip to clean 200 mode, then manually flush. flush() bypasses the deferred timer,
    // consumes mergeOnNextFlush, merges all queued same-(session,device,api,type) contexts
    // into a single POST, sends it.
    throttle.value = false;
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Pre-fix: would be +N POSTs (one per queued context, where N = number of sequence
    // splits that fired during the activity window). Post-fix: exactly +1 merged POST.
    expect(getFetchBodies().length - baseline).toBe(1);

    // The merged POST must carry events from all three activity windows — proving the
    // queued contexts were coalesced rather than reordered, dropped, or split per-marker.
    const mergedBody = getFetchBodies()[getFetchBodies().length - 1];
    expect(bodyContainsInDecodedEvents(mergedBody, 'marker-A')).toBe(true);
    expect(bodyContainsInDecodedEvents(mergedBody, 'marker-B')).toBe(true);
    expect(bodyContainsInDecodedEvents(mergedBody, 'marker-C')).toBe(true);
  });
});
