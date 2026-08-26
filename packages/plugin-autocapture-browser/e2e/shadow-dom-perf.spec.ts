import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Manual perf guard — excluded from default Playwright CI (see root
 * `playwright.config.ts`). Run before enabling shadow DOM for an org:
 *   npx playwright test packages/plugin-autocapture-browser/e2e/shadow-dom-perf.spec.ts
 */
const TRACK_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
const TBT_DIFF_THRESHOLD = 1000;
const LONG_TASK_DIFF_THRESHOLD = 25;

interface PerfResults {
  tbt: number;
  longTasks: number;
  workloadMs: number;
}

interface PerfQuery {
  shadow?: 'on' | 'off';
  skipAutocapture?: boolean;
  scenario?: 'all' | 'clicks' | 'churn' | 'nested' | 'shell';
}

async function stubAmplitude(page: Page): Promise<void> {
  await page.route(TRACK_ENDPOINT, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, events_ingested: 0, payload_size_bytes: 0, server_upload_time: 0 }),
    });
  });
}

async function enableCpuThrottling(page: Page, context: BrowserContext, browserName: string): Promise<void> {
  if (browserName === 'chromium') {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 20 });
  }
}

async function runShadowPerf(
  page: Page,
  context: BrowserContext,
  browserName: string,
  query: PerfQuery,
): Promise<PerfResults> {
  await stubAmplitude(page);
  await enableCpuThrottling(page, context, browserName);

  const params = new URLSearchParams();
  if (query.shadow === 'on') {
    params.set('shadow', 'on');
  }
  if (query.skipAutocapture) {
    params.set('skipAutocapture', 'true');
  }
  if (query.scenario) {
    params.set('scenario', query.scenario);
  }

  const qs = params.toString();
  const url = qs ? `/shadow-dom-perf.html?${qs}` : '/shadow-dom-perf.html';
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), `failed to load ${url} (is the test server running after pnpm build:vite?)`).toBeTruthy();

  const status = page.locator('#status');
  await expect(status).toBeAttached({ timeout: 10_000 });
  const statusText = await status.textContent();
  if (statusText === 'perf-error') {
    const error = await page.locator('#perf-results').getAttribute('data-error');
    throw new Error(`perf workload failed: ${error ?? 'unknown'}`);
  }
  await expect(status).toHaveText('perf-done', { timeout: 60_000 });

  const results = page.locator('#perf-results');
  return {
    tbt: Number(await results.getAttribute('data-tbt')),
    longTasks: Number(await results.getAttribute('data-long-tasks')),
    workloadMs: Number(await results.getAttribute('data-workload-ms')),
  };
}

test.describe('shadow-DOM autocapture performance', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90_000);

  test('shadow off: no meaningful overhead on a shadow-heavy page', async ({ browser, browserName }) => {
    const baselineContext = await browser.newContext();
    const shadowOffContext = await browser.newContext();
    const baselinePage = await baselineContext.newPage();
    const shadowOffPage = await shadowOffContext.newPage();

    try {
      const baseline = await runShadowPerf(baselinePage, baselineContext, browserName, {
        skipAutocapture: true,
        scenario: 'all',
      });
      const shadowOff = await runShadowPerf(shadowOffPage, shadowOffContext, browserName, {
        scenario: 'all',
      });

      expect(shadowOff.tbt - baseline.tbt).toBeLessThan(TBT_DIFF_THRESHOLD);
    } finally {
      await baselineContext.close();
      await shadowOffContext.close();
    }
  });

  test('shadow on: bounded overhead vs shadow off', async ({ browser, browserName }) => {
    const offContext = await browser.newContext();
    const onContext = await browser.newContext();
    const offPage = await offContext.newPage();
    const onPage = await onContext.newPage();

    try {
      const shadowOff = await runShadowPerf(offPage, offContext, browserName, { scenario: 'all' });
      const shadowOn = await runShadowPerf(onPage, onContext, browserName, { shadow: 'on', scenario: 'all' });

      expect(shadowOn.tbt - shadowOff.tbt).toBeLessThan(TBT_DIFF_THRESHOLD);
    } finally {
      await offContext.close();
      await onContext.close();
    }
  });

  test('DOM churn: bounded long-task growth when shadow is enabled', async ({ browser, browserName }) => {
    const offContext = await browser.newContext();
    const onContext = await browser.newContext();
    const offPage = await offContext.newPage();
    const onPage = await onContext.newPage();

    try {
      const shadowOff = await runShadowPerf(offPage, offContext, browserName, { scenario: 'churn' });
      const shadowOn = await runShadowPerf(onPage, onContext, browserName, { shadow: 'on', scenario: 'churn' });

      expect(shadowOn.tbt - shadowOff.tbt).toBeLessThan(TBT_DIFF_THRESHOLD);
      expect(shadowOn.longTasks - shadowOff.longTasks).toBeLessThan(LONG_TASK_DIFF_THRESHOLD);
    } finally {
      await offContext.close();
      await onContext.close();
    }
  });

  test('nested shadow trees: bounded overhead when shadow is enabled', async ({ browser, browserName }) => {
    const offContext = await browser.newContext();
    const onContext = await browser.newContext();
    const offPage = await offContext.newPage();
    const onPage = await onContext.newPage();

    try {
      const shadowOff = await runShadowPerf(offPage, offContext, browserName, { scenario: 'nested' });
      const shadowOn = await runShadowPerf(onPage, onContext, browserName, { shadow: 'on', scenario: 'nested' });

      expect(shadowOn.tbt - shadowOff.tbt).toBeLessThan(TBT_DIFF_THRESHOLD);
      expect(shadowOn.longTasks - shadowOff.longTasks).toBeLessThan(LONG_TASK_DIFF_THRESHOLD);
    } finally {
      await offContext.close();
      await onContext.close();
    }
  });

  test('app shell (header/main/footer): bounded churn overhead when shadow is enabled', async ({
    browser,
    browserName,
  }) => {
    const offContext = await browser.newContext();
    const onContext = await browser.newContext();
    const offPage = await offContext.newPage();
    const onPage = await onContext.newPage();

    try {
      const shadowOff = await runShadowPerf(offPage, offContext, browserName, { scenario: 'shell' });
      const shadowOn = await runShadowPerf(onPage, onContext, browserName, { shadow: 'on', scenario: 'shell' });

      expect(shadowOn.tbt - shadowOff.tbt).toBeLessThan(TBT_DIFF_THRESHOLD);
      expect(shadowOn.longTasks - shadowOff.longTasks).toBeLessThan(LONG_TASK_DIFF_THRESHOLD);
    } finally {
      await offContext.close();
      await onContext.close();
    }
  });
});
