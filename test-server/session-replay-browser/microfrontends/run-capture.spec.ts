import { test, expect, type Page } from '@playwright/test';

const API_KEY: string = process.env.MFE_CAPTURE_API_KEY ?? '';
if (!API_KEY) throw new Error('Set MFE_CAPTURE_API_KEY before running run-capture.spec.ts');
const BASE_SESSION = Number(process.env.MFE_CAPTURE_BASE_SESSION ?? Date.now());
const PARENT_HOST = process.env.MFE_PARENT_HOST ?? '127.0.0.1';
const CHILD_HOST = process.env.MFE_CHILD_HOST ?? 'localhost';
const PORT = process.env.MFE_CAPTURE_PORT ?? '5173';

function parentOrigin(): string {
  return `http://${PARENT_HOST}:${PORT}`;
}

function childOrigin(): string {
  return `http://${CHILD_HOST}:${PORT}`;
}

function childMfeUrl(sessionId: number, deviceId: string, extra: string): string {
  const q = new URLSearchParams({
    sessionId: String(sessionId),
    deviceId,
    apiKey: API_KEY,
  });
  return `${childOrigin()}/session-replay-browser/microfrontends/mfe-child-app.html?${q.toString()}&${extra}`;
}

function buildParentUrl(path: string, params: Record<string, string | number | boolean>): string {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return `${parentOrigin()}${path}?${qs.toString()}`;
}

async function waitForParentReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).srReady === true, undefined, { timeout: 30_000 });
}

async function interactParent(page: Page): Promise<void> {
  for (const sel of ['#parent-click', '#parent-btn', '#track-btn', '#mount-now', '#mount-mfe', '#mode-relaxed']) {
    const el = page.locator(sel);
    if (await el.count())
      await el
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
  }
}

async function interactChildFrames(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const inc = frame.locator('#increment-btn');
    if (await inc.count()) {
      await inc.click({ timeout: 3000 }).catch(() => undefined);
      await inc.click({ timeout: 3000 }).catch(() => undefined);
    }
    const input = frame.locator('#mfe-input');
    if (await input.count()) await input.fill('mfe capture test').catch(() => undefined);
    const mutate = frame.locator('#mutate-dom-btn');
    if (await mutate.count())
      await mutate
        .first()
        .click({ timeout: 2000 })
        .catch(() => undefined);
  }
}

async function flushRecording(page: Page): Promise<void> {
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('blur'));
    const sr = (window as any).sessionReplay;
    if (sr?.flush) await sr.flush(false);
    const amp = (window as any).amplitude;
    if (amp?.flush) await amp.flush().promise;
  });
  await page.waitForTimeout(3000);
}

type CaseDef = {
  name: string;
  path: string;
  offset: number;
  deviceId: string;
  childExtra?: string;
  extraQuery?: Record<string, string>;
  iframeChild?: boolean;
};

const CASES: CaseDef[] = [
  {
    name: 'case-01',
    path: '/session-replay-browser/microfrontends/case-01-same-origin-parent-only.html',
    offset: 1,
    deviceId: 'mfe-capture-01',
    childExtra: 'withSdk=false',
    iframeChild: true,
  },
  {
    name: 'case-02',
    path: '/session-replay-browser/microfrontends/case-02-same-origin-dual-sdk-no-cross-origin.html',
    offset: 2,
    deviceId: 'mfe-capture-02',
    childExtra: 'withSdk=true&crossOrigin=false',
    iframeChild: true,
  },
  {
    name: 'case-03',
    path: '/session-replay-browser/microfrontends/case-03-cross-origin-coordinated.html',
    offset: 3,
    deviceId: 'mfe-capture-03',
    childExtra: 'withSdk=true&crossOrigin=true',
    iframeChild: true,
  },
  {
    name: 'case-04',
    path: '/session-replay-browser/microfrontends/case-04-cross-origin-parent-only-sdk.html',
    offset: 4,
    deviceId: 'mfe-capture-04',
    childExtra: 'withSdk=false',
    iframeChild: true,
  },
  {
    name: 'case-05',
    path: '/session-replay-browser/microfrontends/case-05-cross-origin-child-missing-flag.html',
    offset: 5,
    deviceId: 'mfe-capture-05',
    childExtra: 'withSdk=true&crossOrigin=false',
    iframeChild: true,
  },
  {
    name: 'case-06',
    path: '/session-replay-browser/microfrontends/case-06-analytics-plugin-parent-iframe.html',
    offset: 6,
    deviceId: 'mfe-capture-06',
    childExtra: 'withSdk=false',
    iframeChild: true,
    extraQuery: { crossOrigin: 'true' },
  },
  {
    name: 'case-07',
    path: '/session-replay-browser/microfrontends/case-07-late-mounted-iframe.html',
    offset: 7,
    deviceId: 'mfe-capture-07',
    childExtra: 'withSdk=true&crossOrigin=true',
    iframeChild: true,
    extraQuery: { delayMs: '500' },
  },
  {
    name: 'case-08',
    path: '/session-replay-browser/microfrontends/case-08-nested-iframes.html',
    offset: 8,
    deviceId: 'mfe-capture-08',
    iframeChild: false,
  },
  {
    name: 'case-10',
    path: '/session-replay-browser/microfrontends/case-10-sandboxed-iframe.html',
    offset: 10,
    deviceId: 'mfe-capture-10',
    childExtra: 'withSdk=false',
    iframeChild: true,
  },
  {
    name: 'case-11',
    path: '/session-replay-browser/microfrontends/case-11-coordinate-children-false.html',
    offset: 11,
    deviceId: 'mfe-capture-11',
    childExtra: 'withSdk=true&crossOrigin=true',
    iframeChild: true,
  },
];

test.describe.configure({ mode: 'serial' });

test('microfrontend manual capture run', async ({ page }) => {
  const summary: { baseSession: number; parentOrigin: string; childOrigin: string; cases: object[] } = {
    baseSession: BASE_SESSION,
    parentOrigin: parentOrigin(),
    childOrigin: childOrigin(),
    cases: [],
  };

  for (const c of CASES) {
    const sessionId = BASE_SESSION + c.offset;
    const query: Record<string, string | number | boolean> = {
      apiKey: API_KEY,
      sessionId,
      deviceId: c.deviceId,
      ...c.extraQuery,
    };

    if (c.iframeChild && c.childExtra) {
      query.childSrc = childMfeUrl(sessionId, c.deviceId, c.childExtra);
    }

    if (c.name === 'case-08') {
      const middleQ = new URLSearchParams({
        sessionId: String(sessionId),
        deviceId: c.deviceId,
        apiKey: API_KEY,
      });
      query.middleSrc = `${childOrigin()}/session-replay-browser/microfrontends/mfe-nested-middle.html?${middleQ.toString()}`;
    }

    const uploads: number[] = [];
    const handler = (req: { url: () => string; method: () => string }) => {
      if (req.url().includes('api-sr.amplitude.com') && req.method() === 'POST') uploads.push(1);
    };
    page.on('requestfinished', handler);

    await page.goto(buildParentUrl(c.path, query));

    if (c.name === 'case-06') {
      await page.waitForTimeout(2000);
      await page.locator('#mount-mfe').click();
      await page.waitForTimeout(1500);
    } else if (c.name === 'case-07') {
      await waitForParentReady(page);
      await page.locator('#mount-now').click();
      await page.waitForTimeout(1000);
    } else {
      await waitForParentReady(page);
      await page.waitForTimeout(1500);
    }

    await interactParent(page);
    await page.waitForTimeout(500);
    await interactChildFrames(page);
    await page.waitForTimeout(1000);

    const srError = await page.evaluate(() => (window as any).srError as string | undefined);
    await flushRecording(page);
    page.off('requestfinished', handler);

    summary.cases.push({
      case: c.name,
      sessionId,
      deviceId: c.deviceId,
      srUploadPosts: uploads.length,
      srError,
    });
  }

  // eslint-disable-next-line no-console
  console.log('MFE_CAPTURE_RESULTS', JSON.stringify(summary, null, 2));
  for (const row of summary.cases) {
    expect((row as { srError?: string }).srError).toBeUndefined();
  }
});
