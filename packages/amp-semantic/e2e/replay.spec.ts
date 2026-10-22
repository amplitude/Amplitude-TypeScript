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
    primaryClickListeners: Set<EventListenerOrEventListenerObject>;
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
  for (const event of result.events) {
    expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
    expect(event.data.payload?.tab_id).toEqual(expect.any(String));
    expect(event.data.payload?.document_id).toEqual(expect.any(String));
  }
  expect(new Set(result.events.map((event) => event.data.payload?.tab_id)).size).toBeLessThanOrEqual(1);
  expect(new Set(result.events.map((event) => event.data.payload?.document_id)).size).toBeLessThanOrEqual(1);
  expect(JSON.stringify(result.events)).not.toContain(privateValue);
  expect(JSON.stringify(result.events)).not.toContain('MASKED_FIXTURE_SECRET');
  expect(JSON.stringify(result.events)).not.toContain('BLOCKED_FIXTURE_SECRET');
  return result.events;
}

test.beforeEach(async ({ context }) => {
  // A regression must never send fixture recordings to a real Amplitude endpoint.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return route.abort();
    return route.continue();
  });
});

for (const heatmaps of ['false', 'true']) {
  test(`reuses rrweb primary clicks and preserves native metadata (heatmaps=${heatmaps})`, async ({ page }) => {
    await page.addInitScript(() => {
      window.primaryClickListeners = new Set();
      const add = document.addEventListener.bind(document);
      const remove = document.removeEventListener.bind(document);
      document.addEventListener = (...args: Parameters<Document['addEventListener']>) => {
        const [type, listener, options] = args;
        if (type === 'click' && listener) window.primaryClickListeners.add(listener);
        add(type, listener, options);
      };
      document.removeEventListener = (...args: Parameters<Document['removeEventListener']>) => {
        const [type, listener, options] = args;
        if (type === 'click' && listener) window.primaryClickListeners.delete(listener);
        remove(type, listener, options);
      };
    });
    await open(page, { enabled: 'false', heatmaps });
    const baseline = await page.evaluate(() => window.primaryClickListeners.size);
    expect(baseline).toBeGreaterThan(0);
    await open(page, { heatmaps });
    expect(await page.evaluate(() => window.primaryClickListeners.size)).toBe(baseline);
    await page.locator('#public-button').click({ modifiers: ['Shift'] });
    await page.locator('#public-button').focus();
    await page.keyboard.press('Enter');
    await page.locator('#public-button').click({ button: 'middle' });
    await waitFor(page, 'click', 'keyboard', true);
    const events = await assertValid(page);
    const clicks = events.filter(
      (event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'public-target',
    );
    expect(clicks).toHaveLength(3);
    expect(clicks[0].data.payload).toMatchObject({ modifiers: ['shift'], trusted: true, keyboard: false });
    expect(clicks[1].data.payload).toMatchObject({ trusted: true, keyboard: true });
    const raw = await page.evaluate(() =>
      window.semanticHarness.events.filter(
        (event) => event.type === 3 && event.data.source === 2 && event.data.type === 2,
      ),
    );
    expect(raw.length).toBeGreaterThanOrEqual(2);
    for (const event of raw) {
      expect(
        Object.keys(event.data).every((key) => ['source', 'type', 'id', 'x', 'y', 'pointerType'].includes(key)),
      ).toBe(true);
    }
    if (heatmaps === 'true') {
      const heatmapClicks = await page.evaluate(() =>
        (window.semanticHarness.events as unknown as { type: string; selector?: string }[]).filter(
          (event) => event.type === 'click',
        ),
      );
      expect(heatmapClicks.length).toBeGreaterThan(0);
      expect(heatmapClicks.some((event) => event.selector?.includes('public-button'))).toBe(true);
    }
  });
}

test('captures native check transitions and additive click states through replay', async ({ page }) => {
  await open(page);
  await page.locator('#updates').check();
  await page.locator('#updates').uncheck();
  await page.locator('#delivery-email').check();
  await page.locator('#delivery-browser').check();
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'mixed-busy';
    button.textContent = 'Selection';
    button.setAttribute('aria-pressed', 'mixed');
    button.setAttribute('aria-busy', 'true');
    document.body.append(button);
  });
  await page.locator('#mixed-busy').click();
  await waitFor(page, 'click', 'key', 'mixed-busy');
  const events = await assertValid(page);
  const fields = events.filter((event) => event.data.tag === 'amp-semantic/field');
  expect(
    fields.filter((event) => event.data.payload?.kind === 'checkbox').map((event) => event.data.payload?.checked),
  ).toEqual([true, false]);
  expect(
    fields.filter((event) => event.data.payload?.kind === 'radio').map((event) => event.data.payload?.checked),
  ).toEqual([true, true]);
  expect(
    events.find((event) => event.data.tag === 'amp-semantic/click' && event.data.payload?.key === 'mixed-busy')?.data
      .payload?.states,
  ).toEqual(['mixed', 'busy']);
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
  await expect(page).toHaveURL(/#\/accounts\/8812\?private=hidden$/);
  await page.locator('#public-button').click();
  await waitFor(page, 'click', 'key', 'public-target');
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
      .filter((event) => event.data.tag === 'amp-semantic/click')
      .some((event) => String(event.data.payload?.url).includes('#/accounts/:id')),
  ).toBe(true);
  expect(JSON.stringify(semantic)).not.toContain('private=hidden');
  expect(await page.evaluate(() => window.semanticHarness.batches.some((batch) => batch.compressed))).toBe(true);
});

test('captures clicks without requiring a page change', async ({ page }) => {
  await open(page);
  await page.locator('#no-change').click();
  await waitFor(page, 'click', 'key', 'no-change');
  await assertValid(page);
});

for (const mask of ['light', 'medium', 'conservative']) {
  test(`applies ${mask} replay masking to field values`, async ({ page }) => {
    await open(page, { mask });
    await page.locator('#display-name').fill('Public display name');
    await page.locator('#email').fill(`${privateValue}@example.com`);
    await page.locator('#password').fill(privateValue);
    await page.locator('#masked-button').click();
    await page.locator('#blocked-button').click();
    await page.locator('#public-button').click();
    await waitFor(page, 'click', 'key', 'public-target');
    const semantic = await assertValid(page);
    const fields = semantic.filter((event) => event.data.tag === 'amp-semantic/field');
    expect(fields.some((event) => event.data.payload?.value === 'Public display name')).toBe(mask === 'light');
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

test('explicit unmask permits a native value and later masking omits it', async ({ page }) => {
  await open(page, { mask: 'conservative' });
  const input = page.locator('#display-name');
  await input.evaluate((element) => element.classList.add('amp-unmask'));
  await input.fill('Explicitly public');
  await input.blur();
  await waitFor(page, 'field', 'value', 'Explicitly public');
  await input.evaluate((element) => element.classList.add('amp-mask'));
  await input.fill(privateValue);
  await input.blur();
  await page.evaluate(() => window.semanticHarness.flush());
  const semantic = await assertValid(page);
  const fields = semantic.filter((event) => event.data.tag === 'amp-semantic/field');
  expect(fields[fields.length - 1].data.payload).toMatchObject({ masked: true, value_state: 'filled' });
  expect(fields[fields.length - 1].data.payload).not.toHaveProperty('value');
});

test('captures event-time a11y states, disabled fieldset exceptions and name provenance', async ({ page }) => {
  await open(page, { mask: 'light' });
  await page.evaluate(() => {
    const root = document.createElement('section');
    root.innerHTML =
      '<fieldset disabled><legend><input aria-label="Legend input"></legend><input aria-label="Disabled input"></fieldset><input aria-label="Validation input" aria-invalid="grammar" readonly aria-required="true">';
    document.body.append(root);
    root.querySelectorAll('input').forEach((input) => {
      // Synthetic events exercise the observation path on a natively disabled control.
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
  });
  await waitFor(page, 'field', 'name', 'Validation input');
  const events = await assertValid(page);
  for (const family of ['field', 'keys']) {
    const targets = events
      .filter((event) => event.data.tag === `amp-semantic/${family}`)
      .map((event) => (family === 'keys' ? event.data.payload?.target : event.data.payload) as Record<string, unknown>);
    expect(targets.find((target) => target.name === 'Legend input')).toMatchObject({
      name_source: 'aria-label',
      states: [],
    });
    expect(targets.find((target) => target.name === 'Disabled input')).toMatchObject({
      name_source: 'aria-label',
      states: ['disabled'],
    });
    expect(targets.find((target) => target.name === 'Validation input')).toMatchObject({
      name_source: 'aria-label',
      states: ['required', 'invalid', 'readonly'],
    });
  }
  await page.locator('#open-dialog').click();
  await waitFor(page, 'dialog', 'state', 'open');
  const updated = await assertValid(page);
  const dialog = updated.find(
    (event) => event.data.tag === 'amp-semantic/dialog' && event.data.payload?.state === 'open',
  );
  expect(dialog?.data.payload).toMatchObject({ name: 'Confirm checkout', name_source: 'aria-labelledby' });
});

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
    expect(await page.evaluate(() => sessionStorage.getItem('AMP_semantic_tab_v1'))).toBeNull();
  });
}

test('disables individual families while keeping click capture active', async ({ page }) => {
  await open(page, { disabled: 'context,field,notice,dialog' });
  await page.locator('#display-name').fill(privateValue);
  await page.locator('#show-notice').click();
  await page.locator('#open-dialog').click();
  await page.locator('#close-dialog').click();
  await waitFor(page, 'click', 'key', 'close-dialog');
  const events = await assertValid(page);
  expect(
    events.some((event) =>
      ['amp-semantic/context', 'amp-semantic/field', 'amp-semantic/notice', 'amp-semantic/dialog'].includes(
        event.data.tag ?? '',
      ),
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

async function identity(page: Page) {
  await waitFor(page, 'context');
  const events = await assertValid(page);
  const payload = events.find((event) => event.data.tag === 'amp-semantic/context')?.data.payload;
  return { tab_id: payload?.tab_id, document_id: payload?.document_id };
}

test('keeps tab identity across reloads and separates independent and opener-created tabs', async ({
  page,
  context,
}) => {
  await open(page);
  const first = await identity(page);
  await page.locator('#navigate').click();
  await expect(page).toHaveURL(/#\/accounts\/8812\?private=hidden$/);
  await page.locator('#public-button').click();
  await waitFor(page, 'click', 'key', 'public-target');
  expect(await identity(page)).toEqual(first);
  await page.reload();
  const reloaded = await identity(page);
  expect(reloaded.tab_id).toBe(first.tab_id);
  expect(reloaded.document_id).not.toBe(first.document_id);

  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => window.open('about:blank', '_blank'));
  const popup = await popupPromise;
  // An opener-created page inherits sessionStorage, reproducing the duplicate-tab collision.
  expect(await popup.evaluate(() => sessionStorage.getItem('AMP_semantic_tab_v1'))).toBe(
    await page.evaluate(() => sessionStorage.getItem('AMP_semantic_tab_v1')),
  );
  await open(popup);
  const copied = await identity(popup);
  expect(copied.tab_id).not.toBe(reloaded.tab_id);
  expect(copied.document_id).not.toBe(reloaded.document_id);
  expect(await identity(page)).toEqual(reloaded);
  await popup.close();

  const separate = await context.newPage();
  await open(separate);
  expect((await identity(separate)).tab_id).not.toBe(reloaded.tab_id);
  await separate.close();
});

test('ignores focus-only changes and stops visibility listeners with capture', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  });
  await open(page);
  await page.evaluate(async () => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    window.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    await window.semanticHarness.flush();
  });
  let events = await assertValid(page);
  expect(events.filter((event) => event.data.tag === 'amp-semantic/visibility')).toHaveLength(0);
  await page.evaluate(() => window.semanticHarness.stop());
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => window.semanticHarness.flush());
  events = await assertValid(page);
  expect(events.filter((event) => event.data.tag === 'amp-semantic/visibility')).toHaveLength(0);
});

test('transports only visibility boundaries during a hidden-visible-focus sequence', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  });
  await open(page);
  const initial = await identity(page);
  await page.evaluate(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 3));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 32));
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(page, 'visibility', 'state', 'visible');
  const events = await assertValid(page);
  expect(
    events.filter((event) => event.data.tag === 'amp-semantic/visibility').map((event) => event.data.payload),
  ).toEqual([
    { v: 1, ...initial, state: 'hidden' },
    { v: 1, ...initial, state: 'visible' },
  ]);
});

test('separates browser notification, capture, and batch delivery timing in the inspector', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  await open(page);
  const boundary = await page.evaluate(async () => {
    const notification = new Event('visibilitychange');
    // Model an event created before its callback runs, without claiming this is a native tab switch.
    await new Promise((resolve) => setTimeout(resolve, 100));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const before = Date.now();
    document.dispatchEvent(notification);
    const after = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await window.semanticHarness.flush();
    return { before, after };
  });
  await waitFor(page, 'visibility', 'state', 'hidden');
  const observations = (await assertValid(page)).filter((event) => event.data.tag === 'amp-semantic/visibility');
  expect(observations).toHaveLength(1);
  expect(observations[0].timestamp).toBeGreaterThanOrEqual(boundary.before);
  expect(observations[0].timestamp).toBeLessThanOrEqual(boundary.after);
  const diagnostics = JSON.parse((await page.locator('#visibility-timing').textContent()) || '[]') as Array<{
    type: string;
    browserAt: number;
    observedAt: number;
    handlerDelayMs: number;
  }>;
  const hidden = diagnostics.find((entry) => entry.type === 'visibilitychange');
  expect(hidden?.handlerDelayMs).toBeGreaterThanOrEqual(90);
  expect(hidden?.observedAt).toBeGreaterThanOrEqual(boundary.before);
  await page.locator('#events button').filter({ hasText: 'amp-semantic/visibility' }).click();
  await expect(page.locator('#delivery-timing')).toContainText(`rrweb timestamp: ${observations[0].timestamp}`);
  const timing = await page.locator('#delivery-timing').textContent();
  expect(Number(timing?.match(/Delivery delay: (\d+) ms/)?.[1])).toBeGreaterThanOrEqual(190);
});

test('storage-blocked capture still emits stable identity without claiming reload continuity', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await open(page);
  const first = await identity(page);
  await page.locator('#public-button').click();
  await waitFor(page, 'click', 'key', 'public-target');
  expect(await identity(page)).toEqual(first);
  await page.reload();
  const second = await identity(page);
  expect(second.tab_id).not.toBe(first.tab_id);
  expect(second.document_id).not.toBe(first.document_id);
});

test('captures command-palette keys without ordinary typing or blocked inspector shortcuts', async ({ page }) => {
  await open(page, { mask: 'light' });
  await page.locator('#public-button').focus();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#command-palette')).toBeVisible();
  await page.locator('#command-search').pressSequentially('Public command search');
  await page.keyboard.press('Escape');
  await expect(page.locator('#command-palette')).not.toBeVisible();
  await waitFor(page, 'keys', 'key', 'Escape');
  await page.locator('#disabled').focus();
  await page.keyboard.press('Control+k');
  await page.evaluate(() => window.semanticHarness.flush());
  const events = await assertValid(page);
  const keys = events.filter((event) => event.data.tag === 'amp-semantic/keys');
  expect(JSON.stringify(keys)).not.toContain('Public command search');
  expect(
    events.some(
      (event) => event.data.tag === 'amp-semantic/field' && event.data.payload?.value === 'Public command search',
    ),
  ).toBe(true);
  expect(keys.map((event) => event.data.payload?.key)).toEqual(['Ctrl+K', 'Escape']);
  expect(keys[0].data.payload?.target).toMatchObject({ id: expect.any(Number), role: 'button', name: 'Public action' });
  expect(keys[1].data.payload?.target).toMatchObject({ role: 'textbox' });
});

for (const worker of [false, true])
  test(`captures failed resources with compact payloads (worker=${String(worker)})`, async ({ page }) => {
    // Verify the playground's actual local missing-resource URLs as well as aborted requests.
    if (worker) await page.route('**/api/status/404/semantic-missing/**', (route) => route.abort('failed'));
    await open(page, { mask: 'light', worker: String(worker) });
    await page.locator('#fail-resources').click();
    for (const rt of ['img', 'css', 'script', 'font']) await waitFor(page, 'resource-error', 'rt', rt);
    const events = await assertValid(page);
    const resources = events.filter((event) => event.data.tag === 'amp-semantic/resource-error');
    expect(resources.find((event) => event.data.payload?.rt === 'img')?.data.payload).toMatchObject({
      count: 2,
      path: '/api/status/:id/semantic-missing/:id/image.png',
    });
    const font = resources.find((event) => event.data.payload?.rt === 'font')?.data.payload;
    expect(font).toMatchObject({ count: 1 });
    expect(font).not.toHaveProperty('path');
    expect(font).not.toHaveProperty('container');
    expect(JSON.stringify(resources)).not.toContain('RESOURCE_QUERY_SECRET');
    expect(
      resources.every(
        (event) => !('kind' in (event.data.payload || {})) && !('resource_type' in (event.data.payload || {})),
      ),
    ).toBe(true);
  });

test('new families respect disabled capture and individual family toggles', async ({ page }) => {
  await page.route('**/api/status/404/semantic-missing/**', (route) => route.abort('failed'));
  await open(page, { disabled: 'keys,resource-error' });
  await page.locator('#public-button').focus();
  await page.keyboard.press('Tab');
  await page.locator('#fail-resources').click();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.semanticHarness.flush());
  expect(
    (await assertValid(page)).filter((event) =>
      ['amp-semantic/keys', 'amp-semantic/resource-error'].includes(event.data.tag || ''),
    ),
  ).toEqual([]);
});

test('delivers notices and dialog transitions while large subtrees keep changing', async ({ page }) => {
  await open(page, { mask: 'light', heatmaps: 'false' });
  await page.evaluate(() => {
    const notice = document.createElement('div');
    notice.id = 'pressure-notice';
    notice.setAttribute('role', 'status');
    document.body.appendChild(notice);
    const dialog = document.createElement('dialog');
    dialog.id = 'pressure-dialog';
    dialog.setAttribute('aria-label', 'Pressure dialog');
    document.body.appendChild(dialog);
    const root = document.createElement('section');
    root.id = 'pressure-root';
    document.body.appendChild(root);
  });
  await page.waitForTimeout(50);
  await page.evaluate(async () => {
    const root = document.getElementById('pressure-root')!;
    const notice = document.getElementById('pressure-notice')!;
    const dialog = document.getElementById('pressure-dialog')!;
    for (let i = 0; i < 12; i++) {
      const tree = document.createElement('section');
      tree.innerHTML = '<span></span>'.repeat(1000);
      root.replaceChildren(tree);
      notice.textContent = 'Pressure update';
      dialog.setAttribute('open', '');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  });
  await waitFor(page, 'notice', 'text', 'Pressure update');
  await waitFor(page, 'dialog', 'name', 'Pressure dialog');
  const opened = (await assertValid(page)).find(
    (event) => event.data.tag === 'amp-semantic/dialog' && event.data.payload?.name === 'Pressure dialog',
  );
  await page.evaluate(() => document.getElementById('pressure-dialog')!.remove());
  await expect
    .poll(async () => {
      await page.evaluate(() => window.semanticHarness.flush());
      return page.evaluate(
        (id) =>
          window.semanticHarness.semanticEvents.some(
            (event) =>
              event.data.tag === 'amp-semantic/dialog' &&
              event.data.payload?.id === id &&
              event.data.payload?.state === 'closed',
          ),
        opened?.data.payload?.id,
      );
    })
    .toBe(true);
  await assertValid(page);
});

test('tracks an existing dialog moved under a hidden ancestor through rrweb mutations', async ({ page }) => {
  await open(page, { mask: 'light' });
  await page.evaluate(() => {
    const wrapper = document.createElement('section');
    wrapper.id = 'move-dialog-wrapper';
    wrapper.innerHTML = '<div role="dialog" aria-label="Moved dialog"></div>';
    document.body.appendChild(wrapper);
    const hidden = document.createElement('aside');
    hidden.id = 'move-dialog-hidden';
    hidden.hidden = true;
    document.body.appendChild(hidden);
  });
  await waitFor(page, 'dialog', 'name', 'Moved dialog');
  const opened = (await assertValid(page)).find(
    (event) => event.data.tag === 'amp-semantic/dialog' && event.data.payload?.name === 'Moved dialog',
  );
  expect(opened?.data.payload?.state).toBe('open');
  await page.evaluate(() => {
    document.getElementById('move-dialog-hidden')!.appendChild(document.getElementById('move-dialog-wrapper')!);
  });
  await expect
    .poll(async () => {
      await page.evaluate(() => window.semanticHarness.flush());
      return page.evaluate(
        (id) =>
          window.semanticHarness.semanticEvents.some(
            (event) =>
              event.data.tag === 'amp-semantic/dialog' &&
              event.data.payload?.id === id &&
              event.data.payload?.state === 'closed',
          ),
        opened?.data.payload?.id,
      );
    })
    .toBe(true);
  await assertValid(page);
});
