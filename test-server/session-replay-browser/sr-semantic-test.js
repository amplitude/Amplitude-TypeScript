import * as sessionReplay from '@amplitude/session-replay-browser';
import Ajv from 'ajv';
import schema from '@amplitude/amp-semantic/schema.json';

const params = new URLSearchParams(location.search);
const mask = ['light', 'medium', 'conservative'].includes(params.get('mask')) ? params.get('mask') : 'medium';
const rate = Number(params.get('sampleRate') ?? 1);
const families = Object.fromEntries(
  (params.get('disabled') ?? '')
    .split(',')
    .filter(Boolean)
    .map((name) => [name, false]),
);
const config = {
  enabled: params.get('enabled') !== 'false',
  sampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 1,
  families,
};
const useWebWorker = params.get('worker') === 'true';
const validate = new Ajv({ strict: true, allErrors: true }).compile(schema);
const events = [];
const validationErrors = [];
const batches = [];
const errors = [];
let ready = false;
let recording = false;
let selectedIndex = -1;
let noticeCount = 0;
let truncated = false;
const MAX_EVENTS = 10000;

// The inspector lives in a blocked shadow tree. Updating its log must not become a
// page mutation that changes the result of the click-outcome recorder under test.
const inspector = document.querySelector('#inspector').attachShadow({ mode: 'open' });
inspector.innerHTML = `
  <style>
    :host { display: block; } * { box-sizing: border-box; }
    section { background: #fff; border: 1px solid #dce2eb; border-radius: 12px; padding: 22px; }
    h2 { font: 600 20px system-ui; margin: 0 0 10px; } p, label, button, input, select { font: 14px/1.5 system-ui; }
    p { color: #526174; } .settings { display: flex; flex-wrap: wrap; gap: 10px 16px; }
    label { display: grid; gap: 4px; } input, select, button { padding: 6px 9px; border: 1px solid #bdc9d8; border-radius: 5px; }
    button { cursor: pointer; background: #eef3fc; color: #16376e; } .actions { display: flex; flex-wrap: wrap; gap: 7px; margin: 14px 0; }
    #status { padding: 10px; background: #edf5ef; border-radius: 6px; } #failure { color: #a0182c; white-space: pre-wrap; }
    #events { max-height: 270px; overflow: auto; display: grid; gap: 5px; } #events button { text-align: left; font: 12px ui-monospace, monospace; }
    pre { overflow: auto; max-height: 400px; min-height: 160px; background: #122033; color: #dce8ff; padding: 14px; border-radius: 7px; font: 12px/1.5 ui-monospace, monospace; }
    small { font: 12px/1.5 system-ui; color: #526174; }
  </style>
  <section>
    <h2>Local event inspector</h2>
    <p>Uses the built workspace SDK. No API key or Amplitude network connection is required.</p>
    <form id="settings">
      <div class="settings">
        <label>Semantic capture <select id="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label>Mask level <select id="mask"><option>light</option><option>medium</option><option>conservative</option></select></label>
        <label>Semantic sample rate <input id="sample-rate" type="number" min="0" max="1" step="0.1" /></label>
        <label>Disabled families <input id="disabled" placeholder="field,notice" /></label>
        <label>Web worker <select id="worker"><option value="false">Off</option><option value="true">On</option></select></label>
      </div>
      <div class="actions"><button type="submit">Apply and reload</button></div>
    </form>
    <div id="status" role="status">Initializing…</div>
    <div class="actions">
      <button id="flush" type="button">Flush batches</button>
      <button id="stop" type="button">Stop recording</button>
      <button id="start" type="button">Resume recording</button>
      <button id="export" type="button">Export semantic JSON</button>
    </div>
    <p id="counts"></p><p id="failure" role="alert"></p>
    <label>Event family <select id="filter"><option value="">All families</option></select></label>
    <div id="events" aria-label="Captured semantic events"></div>
    <pre id="detail">Events appear after the SDK delivers a batch. Select one to inspect its rrweb envelope.</pre>
    <small>Schema validation runs on each received semantic event. Disabled capture should still deliver normal replay events. The analytics mirror is not wired into this SDK path yet. Export contains semantic events only.</small>
  </section>`;
const ui = (selector) => inspector.querySelector(selector);
ui('#enabled').value = String(config.enabled);
ui('#mask').value = mask;
ui('#sample-rate').value = String(config.sampleRate);
ui('#disabled').value = params.get('disabled') ?? '';
ui('#worker').value = String(useWebWorker);
const semanticEvents = () => events.filter((event) => event.type === 5 && event.data?.tag?.startsWith('amp-semantic/'));

function report(error) {
  errors.push(error instanceof Error ? error.message : String(error));
  render();
}
function render() {
  const semantic = semanticEvents();
  ui('#status').textContent = !ready ? 'Initializing…' : recording ? 'Recording locally' : 'Recording stopped';
  ui('#counts').textContent = `${batches.length} batches · ${events.length} replay events · ${
    semantic.length
  } semantic events · ${validationErrors.length} schema errors${truncated ? ' · retention limit reached' : ''}`;
  ui('#failure').textContent = [...errors, ...validationErrors.map((error) => `${error.tag}: ${error.message}`)]
    .slice(-10)
    .join('\n');
  const filter = ui('#filter');
  for (const tag of new Set(semantic.map((event) => event.data.tag))) {
    if (!Array.from(filter.options).some((option) => option.value === tag)) {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      filter.append(option);
    }
  }
  const list = ui('#events');
  list.replaceChildren();
  semantic
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => !filter.value || event.data.tag === filter.value)
    .slice(-150)
    .reverse()
    .forEach(({ event, index }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${new Date(event.timestamp).toLocaleTimeString()}  ${event.data.tag}`;
      button.onclick = () => {
        selectedIndex = index;
        ui('#detail').textContent = JSON.stringify(event, null, 2);
      };
      list.append(button);
    });
  if (semantic.length && selectedIndex < 0)
    ui('#detail').textContent = JSON.stringify(semantic[semantic.length - 1], null, 2);
  ui('#stop').disabled = !ready || !recording;
  ui('#start').disabled = !ready || recording;
}

async function receiveBatch({ body, headers }) {
  try {
    let raw;
    if (typeof body === 'string') raw = body;
    else {
      const gzip = Object.entries(headers).some(
        ([key, value]) => key.toLowerCase() === 'content-encoding' && value === 'gzip',
      );
      const stream = new Blob([body]).stream();
      raw = await new Response(gzip ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).text();
    }
    const batch = JSON.parse(raw);
    if (!Array.isArray(batch.events)) throw new Error('Transport batch has no events array');
    const decoded = batch.events.map((event) => (typeof event === 'string' ? JSON.parse(event) : event));
    batches.push({ count: decoded.length, compressed: typeof body !== 'string', receivedAt: Date.now() });
    for (const event of decoded) {
      if (event.type === 5 && event.data?.tag?.startsWith('amp-semantic/') && !validate(event)) {
        validationErrors.push({
          tag: event.data.tag,
          message: validate.errors.map((error) => `${error.instancePath} ${error.message}`).join('; '),
        });
      }
      if (events.length < MAX_EVENTS) events.push(event);
      else truncated = true;
    }
    render();
    return new Response('{"code":200}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    report(error);
    throw error;
  }
}

async function flush() {
  if (!ready) return;
  // Public flush drains queued sends; blur first moves the current sequence into that queue.
  window.dispatchEvent(new Event('blur'));
  await sessionReplay.flush(false);
}
async function stop() {
  sessionReplay.stop();
  recording = false;
  await flush();
  render();
}
async function start() {
  await sessionReplay.start().promise;
  recording = true;
  render();
}
ui('#flush').onclick = () => void flush().catch(report);
ui('#stop').onclick = () => void stop().catch(report);
ui('#start').onclick = () => void start().catch(report);
ui('#filter').onchange = render;
ui('#export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(semanticEvents(), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'amp-semantic-events.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
ui('#settings').onsubmit = (event) => {
  event.preventDefault();
  const next = new URL(location.href);
  next.searchParams.set('enabled', ui('#enabled').value);
  next.searchParams.set('mask', ui('#mask').value);
  next.searchParams.set('sampleRate', ui('#sample-rate').value);
  next.searchParams.set('disabled', ui('#disabled').value);
  next.searchParams.set('worker', ui('#worker').value);
  location.assign(next);
};

document.querySelector('#checkout').onsubmit = (event) => {
  event.preventDefault();
  document.querySelector('#notice').textContent = `Checkout saved (${++noticeCount})`;
};
document.querySelector('#show-notice').onclick = () => {
  document.querySelector('#notice').textContent = `Saved successfully (${++noticeCount})`;
};
document.querySelector('#open-dialog').onclick = () => document.querySelector('#confirmation').showModal();
document.querySelector('#close-dialog').onclick = () => document.querySelector('#confirmation').close();
document.querySelector('#navigate').onclick = () =>
  history.pushState({}, '', `${location.pathname}${location.search}#/accounts/8812?private=hidden`);

// Explicit test API observes transport output, never intercepts amp-semantic.emit or rrweb hooks.
window.semanticHarness = {
  get ready() {
    return ready;
  },
  get recording() {
    return recording;
  },
  get events() {
    return events;
  },
  get semanticEvents() {
    return semanticEvents();
  },
  get validationErrors() {
    return validationErrors;
  },
  get errors() {
    return errors;
  },
  get batches() {
    return batches;
  },
  flush,
  stop,
  start,
};

async function boot() {
  await sessionReplay.init('semantic-local-test-key', {
    deviceId: 'semantic-local-device',
    sessionId: Date.now(),
    sampleRate: 1,
    storeType: 'memory',
    useWebWorker,
    logLevel: 0,
    semanticCapture: config,
    privacyConfig: { defaultMaskLevel: mask },
    performanceConfig: { enabled: false },
    eagerFullSnapshotSend: true,
    captureFullSnapshotOnFocus: false,
    flushIntervalConfig: { minIntervalMs: 0, maxIntervalMs: 1000 },
    trackServerUrl: `${location.origin}/semantic-local-only/track`,
    configServerUrl: `${location.origin}/semantic-local-only/config`,
    handleSendEvents: receiveBatch,
    handleFetchConfig: async () =>
      new Response(
        JSON.stringify({
          configs: {
            sessionReplay: {
              sr_sampling_config: { capture_enabled: true, sample_rate: 1 },
              ...(params.has('remoteEnabled')
                ? { sr_semantic_config: { enabled: params.get('remoteEnabled') === 'true' } }
                : {}),
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  }).promise;
  ready = true;
  recording = true;
  render();
}
void boot().catch(report);
