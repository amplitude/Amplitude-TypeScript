import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { expect, test } from '@playwright/test';
import { parseRequestBody } from './helpers';

// Immutable production build: exercise the runtime behind the embedded proxy,
// rather than replacing forwardEvent with a spy. Verify its bytes on download.
const runtimeUrl =
  'https://cdn.amplitude.com/engagement-browser/builds/32c202cdecaf4a5443e52cb10f82c529e752449c/index.min.js.gz';
const runtimeSha256 = '6d971da34b72bc6f0b64751cdd22a0859b1db9022d781076ff0c51f42c45de12';
let runtime: Buffer;
const analyticsSource = readFileSync(resolve(__dirname, '../../analytics-browser/lib/scripts/amplitude-gtm-min.js'));
// Releases regenerate the SDK loader's SRI. Ordinary local builds retain the
// committed loader, so align its integrity with the local SDK served below.
const wrapperSource = readFileSync(
  resolve(__dirname, '../lib/scripts/analytics-browser-gtm-wrapper.min.js'),
  'utf8',
).replace(/sha384-[A-Za-z0-9+/=]+/, `sha384-${createHash('sha384').update(analyticsSource).digest('base64')}`);

test.beforeAll(async ({ request }) => {
  const response = await request.get(runtimeUrl);
  expect(response.ok()).toBe(true);
  runtime = await response.body();
  expect(createHash('sha256').update(runtime).digest('hex')).toBe(runtimeSha256);
});

function nudge(checklist: boolean) {
  return {
    platform: 'web',
    variantId: 1001,
    flagKey: 'gtm-regression',
    variant: 'treatment',
    title: 'GTM regression',
    displayTitle: 'GTM checklist',
    displayDescription: '',
    type: 'tour',
    archived: false,
    template_source: 'none',
    pageTargeting: { conditions: [[]], configs: [] },
    temporarilyHideTargeting: { conditions: [[]], configs: [] },
    lifecycleConfig: {
      stopShowingIfCompleted: false,
      stopShowingIfDismissed: false,
      cooldownLimits: [],
      conditions: [[]],
    },
    triggerConfig: {
      type: 'analytics_event',
      data: { event: 'show-guide' },
      conditions: [
        [
          { selector: ['context', 'type'], op: 'is', values: ['analytics_event'] },
          { selector: ['context', 'data', 'event'], op: 'is', values: ['show-guide'] },
        ],
      ],
    },
    steps: [
      {
        id: 1,
        title: 'Complete your task',
        formFactor: checklist ? { type: 'checklist' } : { type: 'modal', position: 'center' },
        content: [{ type: 'markdown', meta: { value: 'Guide triggered through GTM' } }],
        ...(checklist ? { goal: { type: 'event_tracked', event: 'complete-task' } } : {}),
      },
    ],
    showStepCounter: false,
    isCarousel: false,
    isDismissible: true,
    isSnoozable: false,
    isSnoozableOnAllSteps: true,
    snoozeLabel: 'Snooze',
    doneLabel: 'Done',
    share_page_url: '',
    previewUrl: null,
    customThemeId: null,
    snoozeDuration: { interval: 'day', value: 3 },
    hideIfPageTargetingNotMet: true,
    translationStatus: null,
    breakingFeatures: null,
    assistantIntro: false,
    enableActiveState: null,
  };
}

for (const checklist of [false, true]) {
  test(`restores ${checklist ? 'checklist event completion' : 'event-triggered guide rendering'}`, async ({ page }) => {
    const analyticsEvents: string[] = [];
    const unexpectedRequests: string[] = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'gtm.test') {
        await route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html><body>GTM regression</body></html>',
        });
      } else if (/^\/libs\/analytics-browser-gtm-.*-min\.js\.gz$/.test(url.pathname)) {
        await route.fulfill({
          contentType: 'application/javascript',
          body: analyticsSource,
        });
      } else if (url.pathname.startsWith('/engagement-browser/')) {
        await route.fulfill({ contentType: 'application/javascript', body: runtime });
      } else if (url.pathname === '/sdk/v1/config') {
        await route.fulfill({
          json: {
            organization: { branding: '', shareLinkParam: '' },
            nudges: [nudge(checklist)],
            themes: [],
            resourceCenters: [],
          },
        });
      } else if (url.pathname === '/sdk/v1/decide') {
        await route.fulfill({ json: { 'gtm-regression': { key: 'treatment', value: 'treatment' } } });
      } else if (url.pathname === '/sdk/v1/state') {
        await route.fulfill({ json: { nudgeInteractions: {} } });
      } else if (url.pathname === '/sdk/v1/resource_center') {
        await route.fulfill({ json: { resourceCenters: [], themes: [] } });
      } else if (url.pathname === '/2/httpapi') {
        const data = parseRequestBody(route.request()) as { events: { event_type: string }[] };
        analyticsEvents.push(...data.events.map((event) => event.event_type));
        await route.fulfill({ json: { code: 200, events_ingested: data.events.length } });
      } else if (url.pathname === '/api/telemetry' || url.pathname === '/sdk/v1/responses') {
        await route.fulfill({ json: {} });
      } else {
        unexpectedRequests.push(url.href);
        await route.abort();
      }
    });
    await page.goto('http://gtm.test');
    await page.addScriptTag({ content: wrapperSource });
    await page.evaluate(async () => {
      const w = window as any;
      const options = {
        guidesSurveys: true,
        autocapture: false,
        defaultTracking: false,
        fetchRemoteConfig: false,
        enableDiagnostics: false,
        identityStorage: 'none',
        flushQueueSize: 1,
        logLevel: 0,
      };
      await w._amplitude('', 'init', 'test-api-key', 'gtm-user', { ...options });
      await w._amplitude('', 'init', 'test-api-key', 'gtm-user', { ...options });
      await w._amplitude('', 'track', 'show-guide').promise;
    });
    if (checklist) {
      await expect(page.getByText('GTM checklist', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
      await page.evaluate(async () => {
        const w = window as any;
        await w._amplitude('', 'init', 'test-api-key', 'gtm-user', {
          guidesSurveys: true,
          autocapture: false,
          defaultTracking: false,
          fetchRemoteConfig: false,
          enableDiagnostics: false,
          identityStorage: 'none',
          flushQueueSize: 1,
          logLevel: 0,
        });
        await w._amplitude('', 'track', 'complete-task').promise;
      });
      await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
      expect(analyticsEvents.filter((event) => event === 'complete-task')).toHaveLength(1);
    } else {
      await expect(page.getByText('Guide triggered through GTM', { exact: true })).toBeVisible();
    }
    expect(analyticsEvents.filter((event) => event === 'show-guide')).toHaveLength(1);
    expect(unexpectedRequests).toEqual([]);
  });
}
