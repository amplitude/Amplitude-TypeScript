import { test, expect, Route, Page } from '@playwright/test';
import { unpack } from '@amplitude/rrweb-packer';

const SR_API_SUCCESS = { code: 200 };
const TEST_SESSION_ID = 1700000000000;

const remoteConfigRecording = {
  configs: { sessionReplay: { sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 } } },
};

function remoteConfigWithPrivacy(privacy: object) {
  return {
    configs: {
      sessionReplay: {
        sr_sampling_config: { capture_enabled: true, sample_rate: 1.0 },
        sr_privacy_config: privacy,
      },
    },
  };
}

function mockRemoteConfig(page: Page, body: object) {
  return page.route('https://sr-client-cfg.amplitude.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

function buildUrl(path: string, params: Record<string, string | number | boolean> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${path}?${qs.toString()}`;
}

async function waitForReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, { timeout: 10_000 });
}

// ─── RRweb snapshot helpers ───────────────────────────────────────────────────

type SnapNode = {
  type: number;
  tagName?: string;
  attributes?: Record<string, string | boolean | null>;
  textContent?: string;
  childNodes?: SnapNode[];
  needBlock?: boolean;
};

const NODE_ELEMENT = 2;
const NODE_TEXT = 3;
const EVENT_FULL_SNAPSHOT = 2;

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

function getSnapshotRoot(rawBodies: string[]): SnapNode | null {
  const events = rawBodies.flatMap(decodeRrwebEvents) as Array<{ type: number; data: { node: SnapNode } }>;
  const snap = events.find((e) => e.type === EVENT_FULL_SNAPSHOT);
  return snap ? snap.data.node : null;
}

function findNode(node: SnapNode, predicate: (n: SnapNode) => boolean): SnapNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function findById(root: SnapNode, id: string): SnapNode | undefined {
  return findNode(root, (n) => n.type === NODE_ELEMENT && n.attributes?.id === id);
}

/** Recursively concatenates all text node content under a node. */
function getTextContent(node: SnapNode): string {
  if (node.type === NODE_TEXT) return node.textContent ?? '';
  return (node.childNodes ?? []).map(getTextContent).join('');
}

/**
 * Returns true if the text consists only of asterisks (and whitespace).
 * maskFn replaces every non-whitespace char with '*', preserving spaces.
 */
function isMaskedText(text: string): boolean {
  const stripped = text.replace(/\s/g, '');
  return stripped.length > 0 && /^\*+$/.test(stripped);
}

/** Mocks the track API and returns a getter for the raw POST bodies received. */
async function captureTrackRequests(page: Page): Promise<() => string[]> {
  const rawBodies: string[] = [];
  await page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    rawBodies.push(route.request().postData() ?? '');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return () => rawBodies;
}

/** Triggers a blur-flush cycle and waits for events to be delivered. */
async function flushRecording(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(500);
}

const PRIVACY_PAGE = '/session-replay-browser/sr-privacy-test.html';

// ─── CSS class-based privacy ──────────────────────────────────────────────────

test.describe('privacy — CSS classes', () => {
  test('amp-block class removes element from the snapshot entirely', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes blocked elements from the serialized tree entirely
    expect(findById(root!, 'amp-block-element')).toBeUndefined();
  });

  test('amp-mask class replaces text content with asterisks in the snapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'amp-mask-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});

// ─── privacyConfig option ─────────────────────────────────────────────────────

test.describe('privacy — privacyConfig option', () => {
  test('blockSelector removes matching element from the snapshot entirely', async ({ page }) => {
    const privacyConfig = JSON.stringify({ blockSelector: ['#selector-blocked'] });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // rrweb removes selector-blocked elements from the serialized tree entirely
    expect(findById(root!, 'selector-blocked')).toBeUndefined();
  });

  test('defaultMaskLevel conservative masks plain text content', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'conservative' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under conservative mode, even plain unhinted text is masked
    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });

  test('defaultMaskLevel light does not mask plain text input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, a plain text input is NOT masked (only sensitive types are)
    const textInput = findById(root!, 'text-input');
    expect(textInput).toBeDefined();
    const value = String(textInput!.attributes?.value ?? '');
    expect(value).toBe('visible input value');
    expect(isMaskedText(value)).toBe(false);
  });

  test('defaultMaskLevel light still masks password input values', async ({ page }) => {
    const privacyConfig = JSON.stringify({ defaultMaskLevel: 'light' });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // Under light mode, password inputs are still masked (they are sensitive)
    const passwordInput = findById(root!, 'password-input');
    expect(passwordInput).toBeDefined();
    const value = String(passwordInput!.attributes?.value ?? '');
    expect(isMaskedText(value)).toBe(true);
  });

  test('unmaskSelector overrides conservative masking for a specific element', async ({ page }) => {
    // defaultMaskLevel:'conservative' routes masking through maskTextFn (via maskTextSelector:'*').
    // unmaskSelector can override this for specific elements. Note: amp-mask CSS class masking is
    // applied natively by rrweb before maskTextFn is called and cannot be overridden this way.
    const privacyConfig = JSON.stringify({
      defaultMaskLevel: 'conservative',
      unmaskSelector: ['#plain-text'],
    });
    await mockRemoteConfig(page, remoteConfigRecording);
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID, privacyConfig }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    // #plain-text is in unmaskSelector — its text should be visible
    const plainEl = findById(root!, 'plain-text');
    expect(plainEl).toBeDefined();
    expect(getTextContent(plainEl!)).toContain('Hello visible world');
    expect(isMaskedText(getTextContent(plainEl!))).toBe(false);

    // amp-mask-text is NOT in unmaskSelector — its text should still be masked
    const maskedEl = findById(root!, 'amp-mask-text');
    expect(maskedEl).toBeDefined();
    expect(isMaskedText(getTextContent(maskedEl!))).toBe(true);
  });
});

// ─── Remote privacy config ────────────────────────────────────────────────────

test.describe('privacy — remote sr_privacy_config', () => {
  test('sr_privacy_config in remote config applies masking to plain text', async ({ page }) => {
    // No local privacyConfig — masking comes entirely from remote config
    await mockRemoteConfig(page, remoteConfigWithPrivacy({ defaultMaskLevel: 'conservative' }));
    const getBodies = await captureTrackRequests(page);

    await page.goto(buildUrl(PRIVACY_PAGE, { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(500);
    await flushRecording(page);

    const root = getSnapshotRoot(getBodies());
    expect(root).not.toBeNull();

    const el = findById(root!, 'plain-text');
    expect(el).toBeDefined();
    expect(isMaskedText(getTextContent(el!))).toBe(true);
  });
});
