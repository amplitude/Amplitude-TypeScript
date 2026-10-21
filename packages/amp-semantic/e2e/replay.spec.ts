import { test, expect, Page } from '@playwright/test';
import Ajv from 'ajv';
import * as schema from '../schema.json';

type WireEvent = {
  type: number;
  timestamp: number;
  data: { tag?: string; payload?: Record<string, unknown>; source?: number; type?: number; id?: number };
};
type Harness = {
  ready: boolean;
  recording: boolean;
  events: WireEvent[];
  semanticEvents: WireEvent[];
  errors: string[];
  validationErrors: { tag: string; message: string }[];
  batches: { count: number; compressed: boolean }[];
  flush: () => Promise<void>;
  stop: () => Promise<void>;
  start: () => Promise<void>;
};
declare global {
  interface Window {
    semanticHarness: Harness;
  }
}

const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
const path = '/session-replay-browser/sr-semantic-test.html';
const privateValue = 'TYPED_PRIVATE_9b734';

async function open(page: Page, params: Record<string, string> = {}) {
  await page.goto(`${path}?${new URLSearchParams(params).toString()}`);
  await expect
    .poll(() => page.evaluate(() => window.semanticHarness?.ready || window.semanticHarness?.errors.join('; ')))
    .toBe(true);
  await expect
    .poll(async () => {
      await page.evaluate(() => window.semanticHarness.flush());
      return page.evaluate(() => window.semanticHarness.events.some((event) => event.type === 2));
    })
    .toBe(true);
}
async function waitFor(page: Page, family: string, property?: string, value?: unknown) {
  await expect
    .poll(async () => {
      await page.evaluate(() => window.semanticHarness.flush());
      return page.evaluate(
        ({ family, property, value }) =>
          window.semanticHarness.semanticEvents.some(
            (event) =>
              event.data.tag === `amp-semantic/${family}` && (!property || event.data.payload?.[property] === value),
          ),
        { family, property, value },
      );
    })
    .toBe(true);
}
async function assertValid(page: Page) {
  const result = await page.evaluate(() => ({
    events: window.semanticHarness.semanticEvents,
    errors: window.semanticHarness.errors,
    validation: window.semanticHarness.validationErrors,
  }));
  expect(result.errors).toEqual([]);
  expect(result.validation).toEqual([]);
  for (const event of result.events) expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  expect(JSON.stringify(result.events)).not.toContain(privateValue);
  expect(JSON.stringify(result.events)).not.toContain('MASKED_FIXTURE_SECRET');
  expect(JSON.stringify(result.events)).not.toContain('BLOCKED_FIXTURE_SECRET');
  return result.events;
}

test.beforeEach(async ({ page }) => {
  // A regression must never send fixture recordings to a real Amplitude endpoint.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    return route.continue();
  });
});

test('delivers real rrweb envelopes through replay transport with matching click node IDs', async ({ page }) => {
  await open(page);
  await waitFor(page, 'context');
  const browserContext = await page.evaluate(() => ({
    visibility_state: document.visibilityState,
    user_agent: navigator.userAgent,
  }));
  const contextPayload = await page.evaluate(
    () =>
      window.semanticHarness.semanticEvents.find((event) => event.data.tag === 'amp-semantic/context')?.data.payload,
  );
  expect(contextPayload).toMatchObject(browserContext);
  await waitFor(page, 'recording', 'state', 'start');
  await waitFor(page, 'page');
  await page.locator('#display-name').fill(privateValue);
  await page.locator('#email').fill(`${privateValue}@example.com`);
  await page.locator('#password').fill(privateValue);
  await page.locator('#plan').selectOption({ label: 'Team' });
  await page.locator('#save').click();
  await waitFor(page, 'submit', 'valid', true);
  await waitFor(page, 'notice');
  await page.locator('#open-dialog').click();
  await waitFor(page, 'dialog', 'state', 'open');
  await page.locator('#close-dialog').click();
  await waitFor(page, 'dialog', 'state', 'closed');
  await page.locator('#navigate').click();
  await waitFor(page, 'page', 'nav', 'push');
  const semantic = await assertValid(page);
  expect(semantic.some((event) => event.data.tag === 'amp-semantic/field')).toBe(true);
  const click = semantic.find(
    (event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'save-checkout',
  );
  expect(click).toBeDefined();
  const raw = await page.evaluate(() => window.semanticHarness.events);
  const mouseInteraction = raw.find(
    (event) =>
      event.type === 3 && event.data.source === 2 && event.data.type === 2 && event.data.id === click?.data.payload?.id,
  );
  expect(mouseInteraction).toBeDefined();
  expect(raw.findIndex((event) => event.type === 2)).toBeLessThan(
    raw.findIndex((event) => event.data.tag === 'amp-semantic/context'),
  );
  expect(
    semantic
      .filter((event) => event.data.tag === 'amp-semantic/page')
      .some((event) => String(event.data.payload?.url).includes('#/accounts/:id')),
  ).toBe(true);
  expect(JSON.stringify(semantic)).not.toContain('private=hidden');
  expect(await page.evaluate(() => window.semanticHarness.batches.some((batch) => batch.compressed))).toBe(true);
});

test('inspector updates do not turn a no-change click into a DOM change', async ({ page }) => {
  await open(page);
  await waitFor(page, 'page');
  await page.locator('#no-change').click();
  await waitFor(page, 'click-outcome', 'no_change', true);
  await assertValid(page);
});

for (const mask of ['light', 'medium', 'conservative']) {
  test(`applies ${mask} replay masking and never includes typed values`, async ({ page }) => {
    await open(page, { mask });
    await page.locator('#display-name').fill(privateValue);
    await page.locator('#email').fill(`${privateValue}@example.com`);
    await page.locator('#password').fill(privateValue);
    await page.locator('#masked-button').click();
    await page.locator('#blocked-button').click();
    await page.locator('#public-button').click();
    await waitFor(page, 'click', 'key', 'public-target');
    const semantic = await assertValid(page);
    const masked = semantic.find(
      (event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'masked-target',
    );
    expect(masked?.data.payload?.name).toBeNull();
    expect(masked?.data.payload?.name_source).toBe('masked');
    const publicClick = semantic.find(
      (event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'public-target',
    );
    expect(publicClick?.data.payload?.name).toBe('Public action');
    expect(
      semantic
        .filter((event) => event.data.tag === 'amp-semantic/field')
        .every((event) => event.data.payload?.kind !== 'password'),
    ).toBe(true);
  });
}

for (const [label, params] of [
  ['disabled', { enabled: 'false' }],
  ['sampled out', { sampleRate: '0' }],
  ['remote kill switch', { remoteEnabled: 'false' }],
] as const) {
  test(`${label} preserves ordinary replay without semantic events`, async ({ page }) => {
    await open(page, params);
    await page.locator('#show-notice').click();
    await expect
      .poll(async () => {
        await page.evaluate(() => window.semanticHarness.flush());
        return page.evaluate(() =>
          window.semanticHarness.events.some((event) => event.type === 3 && event.data.source === 2),
        );
      })
      .toBe(true);
    expect(await assertValid(page)).toEqual([]);
  });
}

test('disables individual families while keeping click capture active', async ({ page }) => {
  await open(page, { disabled: 'field,notice,dialog' });
  await page.locator('#display-name').fill(privateValue);
  await page.locator('#show-notice').click();
  await page.locator('#open-dialog').click();
  await page.locator('#close-dialog').click();
  await waitFor(page, 'click', 'key', 'close-dialog');
  const events = await assertValid(page);
  expect(
    events.some((event) =>
      ['amp-semantic/field', 'amp-semantic/notice', 'amp-semantic/dialog'].includes(event.data.tag ?? ''),
    ),
  ).toBe(false);
});

test('stop is delivered before teardown and resume uses the same capture lifecycle', async ({ page }) => {
  await open(page);
  await waitFor(page, 'recording', 'state', 'start');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await waitFor(page, 'recording', 'state', 'stop');
  await page.locator('#show-notice').click();
  await page.evaluate(() => window.semanticHarness.flush());
  expect(
    (await assertValid(page)).some(
      (event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'show-notice',
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'Resume recording', exact: true }).click();
  await waitFor(page, 'recording', 'state', 'resume');
  await page.locator('#show-notice').click();
  await waitFor(page, 'click', 'key', 'show-notice');
  await assertValid(page);
});

test('captures browser-validation failures and exports validated envelopes', async ({ page }) => {
  await open(page);
  await page.locator('#save').click();
  await waitFor(page, 'submit', 'valid', false);
  const events = await assertValid(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export semantic JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('amp-semantic-events.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported: WireEvent[] = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.length).toBeGreaterThanOrEqual(events.length);
  expect(exported.every((event) => validate(event))).toBe(true);
});

test('supports the web-worker transport path', async ({ page }) => {
  await open(page, { worker: 'true' });
  await page.locator('#public-button').click();
  await waitFor(page, 'click', 'key', 'public-target');
  await assertValid(page);
});
