/* Run from the repository root: node packages/amp-semantic/test/e2e/smoke.cjs */
const assert = require('node:assert/strict');
const path = require('node:path');
const { build } = require('vite');
const { chromium } = require('@playwright/test');
const Ajv = require('ajv');
const schema = require('../../schema.json');

(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: path.resolve(__dirname, '../../src/index.ts'), name: 'AmpSemantic', formats: ['iife'] },
    },
  });
  const script = result[0].output.find((item) => item.type === 'chunk').code;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<title>Checkout</title><main><h1>Checkout</h1><form><label>Name<input name="name"></label><label>Email<input type="email"></label><input type="password"><button type="submit" data-amp-key="save">Save</button></form><div role="status"></div><dialog aria-label="Confirm"></dialog></main>',
    );
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async () => {
      const events = [];
      const ids = new WeakMap();
      let nextId = 1;
      const host = {
        window,
        document,
        sdk: 'smoke',
        getPrivacy: () => ({ defaultMaskLevel: 'medium' }),
        getUrl: () => 'https://example.com/accounts/123?secret=hidden',
        getNodeId: (node) => {
          if (!ids.has(node)) ids.set(node, nextId++);
          return ids.get(node);
        },
        emit: (event) => events.push(event),
      };
      const capture = AmpSemantic.createSemanticCapture({ enabled: true }, host);
      capture.start();
      capture.notify('recording', { state: 'start', reason: 'init' });
      capture.notify('snapshot', undefined);
      const form = document.querySelector('form');
      form.addEventListener('submit', (event) => event.preventDefault());
      for (const input of document.querySelectorAll('input')) {
        input.value = input.type === 'email' ? 'typed-secret@example.com' : 'typed-secret';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const button = document.querySelector('button');
      button.click();
      capture.notify('analytics', {
        eventType: '[Amplitude] Rage Click',
        properties: { '[Amplitude] Element Text': 'Save', '[Amplitude] Clicks': 6 },
        element: button,
      });
      document.querySelector('[role="status"]').textContent = 'Saved';
      document.querySelector('dialog').showModal();
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Exercise reconfiguration after the first snapshot, with no new snapshot.
      capture.updateConfig({ enabled: true, families: { keys: false } });
      capture.notify('navigation', 'push');
      await new Promise((resolve) => setTimeout(resolve, 50));
      const timings = [];
      for (let i = 0; i < 300; i++) {
        const started = performance.now();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        timings.push(performance.now() - started);
      }
      capture.stop();
      const count = events.length;
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const unchanged = events.length === count;
      const disabled = AmpSemantic.createSemanticCapture({ enabled: false }, host);
      disabled.start();
      button.click();
      disabled.stop();
      return {
        events,
        unchanged: unchanged && events.length === count,
        p95: timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)],
      };
    });
    const validate = new Ajv({ strict: true }).compile(schema);
    for (const event of result.events) {
      const wire = {
        type: 5,
        timestamp: event.timestamp,
        data: { tag: `amp-semantic/${event.name}`, payload: event.payload },
      };
      assert(validate(wire), JSON.stringify({ name: event.name, errors: validate.errors }));
    }
    assert(!JSON.stringify(result.events).includes('typed-secret'), 'Typed values leaked');
    assert(result.unchanged, 'Events emitted after teardown or while disabled');
    for (const name of ['context', 'recording', 'click', 'page', 'field', 'submit', 'notice', 'dialog', 'amp-event'])
      assert(
        result.events.some((event) => event.name === name),
        `Missing ${name}`,
      );
    assert(
      result.events.some((event) => event.name === 'page' && event.payload.nav === 'push'),
      'Page recorder lost snapshot readiness',
    );
    console.log(
      JSON.stringify({
        eventsValidated: result.events.length,
        clickDispatchP95Ms: result.p95,
        noTypedValues: true,
        cleanup: true,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
