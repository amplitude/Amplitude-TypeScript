import { gunzipSync } from 'zlib';
import { Route, Page } from '@playwright/test';

export const SR_API_SUCCESS = { code: 200 };
export const TEST_SESSION_ID = 1700000000000; // fixed timestamp always in sample at 100%
export const SNAPSHOT_SETTLE_MS = 500; // time for rrweb to capture its initial full snapshot

export const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

export function mockRemoteConfig(page: Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

export function buildUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs.toString()}`;
}

export async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, { timeout: 10_000 });
}

// ─── RRweb snapshot helpers ───────────────────────────────────────────────────

export type SnapNode = {
  type: number;
  tagName?: string;
  attributes?: Record<string, string | boolean | null>;
  textContent?: string;
  childNodes?: SnapNode[];
  needBlock?: boolean;
};

export const NODE_ELEMENT = 2;
export const NODE_TEXT = 3;
export const EVENT_FULL_SNAPSHOT = 2;

function decodeRrwebEvents(rawBody: string): unknown[] {
  if (!rawBody) return [];
  try {
    const payload = JSON.parse(rawBody) as { events?: unknown[] };
    if (!Array.isArray(payload.events)) return [];
    return payload.events.flatMap((eventStr) => {
      if (typeof eventStr !== 'string') return [];
      try {
        return [JSON.parse(eventStr) as unknown];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function getSnapshotRoot(rawBodies: string[]): SnapNode | null {
  const events = rawBodies.flatMap(decodeRrwebEvents) as Array<{ type: number; data: { node: SnapNode } }>;
  const snap = events.find((e) => e.type === EVENT_FULL_SNAPSHOT);
  return snap ? snap.data.node : null;
}

/** Returns the root of the LAST full snapshot across all collected bodies. */
export function getLastSnapshotRoot(rawBodies: string[]): SnapNode | null {
  const events = rawBodies.flatMap(decodeRrwebEvents) as Array<{ type: number; data: { node: SnapNode } }>;
  const snaps = events.filter((e) => e.type === EVENT_FULL_SNAPSHOT);
  const last = snaps[snaps.length - 1];
  return last ? last.data.node : null;
}

export function findNode(node: SnapNode, predicate: (n: SnapNode) => boolean): SnapNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

export function findById(root: SnapNode, id: string): SnapNode | undefined {
  return findNode(root, (n) => n.type === NODE_ELEMENT && n.attributes?.id === id);
}

/** Recursively concatenates all text node content under a node. */
export function getTextContent(node: SnapNode): string {
  if (node.type === NODE_TEXT) return node.textContent ?? '';
  return (node.childNodes ?? []).map(getTextContent).join('');
}

/**
 * Returns true if the text consists only of asterisks (and whitespace).
 * maskFn replaces every non-whitespace char with '*', preserving spaces.
 */
export function isMaskedText(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  return stripped.length > 0 && /^\*+$/.test(stripped);
}

/**
 * Reads the POST body from a Playwright Route, decompressing gzip if needed.
 * Use this inside page.route() handlers for the track API.
 */
export function readRouteBody(route: Route): string {
  const headers = route.request().headers();
  if (headers['content-encoding'] === 'gzip') {
    const buf = route.request().postDataBuffer();
    return buf ? gunzipSync(buf).toString('utf-8') : '';
  }
  return route.request().postData() ?? '';
}

/** Mocks the track API and returns getters for the raw POST bodies and request headers received. */
export async function captureTrackRequests(
  page: Page,
): Promise<{ getBodies: () => string[]; getHeaders: () => Record<string, string>[] }> {
  const rawBodies: string[] = [];
  const requestHeaders: Record<string, string>[] = [];
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    requestHeaders.push(route.request().headers());
    rawBodies.push(readRouteBody(route));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return { getBodies: () => rawBodies, getHeaders: () => requestHeaders };
}

/** Triggers a blur-flush cycle and waits for events to be delivered. */
export async function flushRecording(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}
