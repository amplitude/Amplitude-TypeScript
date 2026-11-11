import { test, expect, Page } from '@playwright/test';
import Ajv from 'ajv';
import * as schema from '../schema.json';

type WireEvent = { type: number; timestamp: number; data: { tag: string; payload: Record<string, unknown> } };
declare global {
  interface Window {
    semanticHarness: {
      ready: boolean;
      events: WireEvent[];
      errors: string[];
      flush: () => Promise<void>;
      stop: () => Promise<void>;
      start: () => Promise<void>;
    };
  }
}
const validate = new Ajv().compile(schema);
async function open(page: Page, query = '') {
  await page.goto(`/session-replay-browser/sr-semantic-test.html${query}`);
  await expect.poll(() => page.evaluate(() => window.semanticHarness?.ready)).toBe(true);
}
async function flush(page: Page) {
  await page.evaluate(() => window.semanticHarness.flush());
  return page.evaluate(() => window.semanticHarness.events);
}
async function visibility(page: Page, state: 'hidden' | 'visible') {
  // Deterministic notification input; native tab scheduling is checked manually in Chrome.
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('real replay transport delivers context and visibility with stable identity and timestamps', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !new URL(request.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
      external.push(request.url());
    }
  });
  await open(page);
  await expect
    .poll(async () => (await flush(page)).filter((e) => e.data.tag === 'amp-semantic/context').length)
    .toBe(1);
  await visibility(page, 'hidden');
  await page.waitForTimeout(100);
  await visibility(page, 'visible');
  await expect
    .poll(async () => (await flush(page)).filter((e) => e.data.tag === 'amp-semantic/visibility').length)
    .toBe(2);
  await expect
    .poll(async () => (await flush(page)).filter((e) => e.data.tag === 'amp-semantic/context').length)
    .toBe(2);
  const events = (await flush(page)).filter((event) =>
    ['amp-semantic/context', 'amp-semantic/visibility'].includes(event.data.tag),
  );
  expect(events.map((e) => e.data.tag)).toEqual([
    'amp-semantic/context',
    'amp-semantic/visibility',
    'amp-semantic/visibility',
    'amp-semantic/context',
  ]);
  expect(events[2].timestamp - events[1].timestamp).toBeGreaterThanOrEqual(90);
  expect(events[3].data.payload.visibility_state).toBe('visible');
  for (const event of events) {
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
    expect(event.data.payload.tab_id).toBe(events[0].data.payload.tab_id);
    expect(event.data.payload.document_id).toBe(events[0].data.payload.document_id);
  }
  expect(external).toEqual([]);
  expect(await page.evaluate(() => window.semanticHarness.errors)).toEqual([]);
});

for (const query of [
  '?enabled=false',
  '?sampleRate=0',
  '?remoteEnabled=false',
  '?disabled=context,visibility,lifecycle,navigation',
  '?createCapture=false&remoteEnabled=true',
]) {
  test(`capture gates suppress semantic output: ${query}`, async ({ page }) => {
    await open(page, query);
    await visibility(page, 'hidden');
    await visibility(page, 'visible');
    await page.evaluate(() => window.semanticHarness.stop());
    expect(await flush(page)).toEqual([]);
    expect(await page.evaluate(() => window.semanticHarness.errors)).toEqual([]);
  });
}

test('stop removes listeners and resume emits fresh context without resetting document identity', async ({ page }) => {
  await open(page);
  await expect
    .poll(async () => (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/context').length)
    .toBe(1);
  const before = (await flush(page)).length;
  await page.evaluate(() => window.semanticHarness.stop());
  await visibility(page, 'hidden');
  expect((await flush(page)).length).toBe(before);
  await page.evaluate(() => window.semanticHarness.start());
  await expect
    .poll(async () => (await flush(page)).filter((e) => e.data.tag === 'amp-semantic/context').length)
    .toBe(2);
  const contexts = (await flush(page)).filter((e) => e.data.tag === 'amp-semantic/context');
  expect(contexts[1].data.payload.visibility_state).toBe('hidden');
  expect(contexts[1].data.payload.document_id).toBe(contexts[0].data.payload.document_id);
});

test('browser lifecycle boundaries use the replay custom-event transport', async ({ page }) => {
  await open(page);
  await expect
    .poll(async () => (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/context').length)
    .toBe(1);
  const previous = (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/lifecycle').length;
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    window.dispatchEvent(restored);
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
  });
  const lifecycle = (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/lifecycle').slice(previous);
  expect(lifecycle.map((event) => event.data.payload.type)).toEqual([
    'pagehide',
    'pageshow_bfcache',
    'freeze',
    'resume',
  ]);
  for (const event of lifecycle) expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
});

test('URL plugin observations produce templated navigation events', async ({ page }) => {
  await open(page);
  await expect
    .poll(async () => (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/navigation').length)
    .toBe(1);
  await page.evaluate(() => {
    window.location.hash = '#/accounts/8812?private=hidden';
  });
  await expect
    .poll(async () => (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/navigation').length)
    .toBe(2);
  const navigation = (await flush(page)).filter((event) => event.data.tag === 'amp-semantic/navigation');
  expect(navigation[1].data.payload.url).toContain('#/accounts/:id');
  for (const event of navigation) expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
});
