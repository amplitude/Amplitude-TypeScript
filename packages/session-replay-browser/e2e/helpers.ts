import { Route, Page } from '@playwright/test';
import { unpack } from '@amplitude/rrweb-packer';

export const SR_API_SUCCESS = { code: 200 };
export const TEST_SESSION_ID = 1700000000000; // fixed timestamp always in sample at 100%

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
        return [unpack(JSON.parse(eventStr))];
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

/** Mocks the track API and returns a getter for the raw POST bodies received. */
export async function captureTrackRequests(page: Page): Promise<() => string[]> {
  const rawBodies: string[] = [];
  await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    rawBodies.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return () => rawBodies;
}

/** Triggers a blur-flush cycle and waits for events to be delivered. */
export async function flushRecording(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(500);
}
