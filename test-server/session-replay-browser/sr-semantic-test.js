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
const visibilityTiming = [];
const receivedTimes = new WeakMap();
const errors = [];
let ready = false;
let recording = false;
let selectedIndex = -1;
let noticeCount = 0;
let truncated = false;
const MAX_EVENTS = 10000;

// Local help stays in the blocked inspector, outside captured page content.
const eventGuide = {
  context: {
    description: 'Environment snapshot emitted with each rrweb full snapshot.',
    fields:
      'SDK, masking policy, viewport, device, language, user_agent, visibility_state and focused. These describe that moment, not continuous state.',
    tryIt: 'Reload or resume recording to capture a new snapshot.',
  },
  navigation: {
    description: 'The initial page URL and later URL changes, reused from the existing replay URL plugin.',
    fields:
      'url is a templated path and optional hash route, without origin or query values. Different navigations may share a template. No title or navigation reason is included.',
    tryIt:
      'Click Navigate to account 8812, then use Back/Forward. Resume recording emits the current URL again. Capture follows the replay URL plugin’s event or polling mode.',
  },
  click: {
    description: 'A primary or middle click, including keyboard-activated clicks.',
    fields:
      'Target id, role, name and name_source; container, states, visibility, URL/heading, modifiers, keyboard and trusted. The id identifies a recorded DOM node, not a unique click.',
    tryIt: 'Click Public action, Open confirmation, or Click with no change.',
  },
  field: {
    description:
      'A field state observed on change or focus leaving the field; unchanged observations may be deduplicated.',
    fields:
      'Target, kind, states, value_state, validity and masking. Checkbox/radio controls include checked; native input/textarea value appears only when the masking policy permits it. Password fields are excluded.',
    tryIt: 'Edit Display name and leave the field, choose a Plan, or toggle Receive updates.',
  },
  submit: {
    description: 'A form submission or a browser validation failure that prevents submission.',
    fields:
      'Form, submitter, valid, invalid_fields and prevented. prevented records whether an application handler canceled submission.',
    tryIt: 'Click Save checkout with empty required fields, then fill them and try again.',
  },
  notice: {
    description: 'Text appears or changes in an alert, status, log, or live region, detected from rrweb changes.',
    fields:
      'Region id, role, privacy-filtered text, visibility, container region and cause_click_ts. Updates are coalesced per region over 500 ms; a nearby click timestamp is correlation, not proof of causation.',
    tryIt: 'Click Show notice or submit a valid checkout.',
  },
  dialog: {
    description:
      'A recorded dialog opens, closes, is removed, or changes hidden state. Existing dialogs are seeded silently at startup.',
    fields:
      'Dialog id, role, name/name_source, state, modal, visible and cause_click_ts. Removed dialogs retain their id but clear their name. CSS-only visibility changes are not tracked.',
    tryIt: 'Open and close the confirmation or command palette.',
  },
  keys: {
    description: 'Supported non-character keys and approved shortcuts; ordinary typing is excluded.',
    fields: 'Canonical key or shortcut plus target role, name, name_source, id and states, subject to privacy rules.',
    tryIt: 'Press Tab, Escape, Enter, or Ctrl/Cmd+K in the playground.',
  },
  'resource-error': {
    description: 'An image, stylesheet, script, or font fails to load. Matching failures are grouped over 500 ms.',
    fields:
      'rt (img, css, script, font), count, and optional container and templated path. CSS parsing mistakes and incorrect visual styling are not load failures.',
    tryIt: 'Click Trigger resource failures. Font failures may have no path or container.',
  },
  recording: {
    description: 'The recorder starts, stops, pauses, or resumes.',
    fields:
      'state and reason explain the recording boundary. These do not themselves prove a replay gap or user inactivity.',
    tryIt: 'Use Stop recording and Resume recording in this inspector.',
  },
  visibility: {
    description: 'The document changes between visible and hidden.',
    fields:
      'state (visible or hidden). This is tab/document visibility, not element visibility or keyboard focus; blur/focus alone does not emit this event.',
    tryIt:
      'Switch away from this tab and return. Use Chrome to check native tab timing; embedded browsers may report different timing.',
  },
  lifecycle: {
    description: 'The browser reports pagehide, pageshow, a back/forward-cache restore, freeze, or resume.',
    fields:
      'type identifies the lifecycle boundary. Browser support and delivery vary; freeze/resume are not guaranteed for each tab switch.',
    tryIt: 'Navigate away and back to exercise page lifecycle. A reload resets this local event list.',
  },
  'amp-event': {
    description:
      'An allowlisted analytics signal (rage, dead or error click, or thrashed cursor) forwarded after analytics accepts it. Not wired into this test page yet.',
    fields: 'event_type, insert_id, optional target id and allowlisted props.',
    tryIt: 'No fixture currently emits this family; its absence here is expected.',
  },
};

// Keep inspector controls and log updates outside recorded page content.
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
    details { margin: 14px 0; } summary { cursor: pointer; font: 600 14px/1.5 system-ui; }
    #event-guide dl { margin: 12px 0; max-height: 330px; overflow: auto; }
    #event-guide dt { font: 600 13px/1.5 ui-monospace, monospace; margin-top: 14px; }
    #event-guide dd { margin: 5px 0 14px; font: 13px/1.5 system-ui; color: #526174; }
    #event-description { padding: 10px 12px; border-left: 3px solid #8baee6; background: #f4f7fc; font: 13px/1.5 system-ui; white-space: pre-line; }
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
    <details id="event-guide"><summary>What each event captures</summary>
      <p>Events use rrweb type 5 with an amp-semantic/ tag. Shared fields: v is the schema version; tab_id identifies the tab and document_id the loaded document. Node IDs are scoped to the recording/document. Masked names or text may be null; blocked elements are excluded. Disabled families and sampling can suppress events.</p>
      <dl></dl>
    </details>
    <p id="counts"></p><p id="failure" role="alert"></p>
    <label>Event family <select id="filter"><option value="">All families</option></select></label>
    <div id="events" aria-label="Captured semantic events"></div>
    <p id="event-description">Select an event for its trigger, fields, and an example to try.</p>
    <pre id="detail">Events appear after the SDK delivers a batch. Select one to inspect its rrweb envelope.</pre>
    <details><summary>Visibility timing diagnostics (local only)</summary>
      <p>Browser time is event creation time, not a guaranteed physical tab-switch time. Handler time is when this page runs the callback. These diagnostics are not emitted into replay.</p>
      <pre id="visibility-timing">No browser lifecycle notifications yet.</pre>
    </details>
    <p id="delivery-timing"></p>
    <small>Schema validation runs on each received semantic event. Disabled capture should still deliver normal replay events. The analytics mirror is not wired into this SDK path yet. Export contains semantic events only.</small>
  </section>`;
const ui = (selector) => inspector.querySelector(selector);
for (const [family, guide] of Object.entries(eventGuide)) {
  const term = document.createElement('dt');
  term.textContent = `amp-semantic/${family}`;
  const description = document.createElement('dd');
  description.textContent = `${guide.description} ${guide.fields} Try it: ${guide.tryIt}`;
  ui('#event-guide dl').append(term, description);
}
function describeEvent(event) {
  const guide = eventGuide[event.data.tag?.replace('amp-semantic/', '')];
  ui('#event-description').textContent = guide
    ? `${guide.description}\nFields: ${guide.fields}\nTry it: ${guide.tryIt}`
    : 'No description is available for this event family.';
}
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
      button.textContent = `${new Date(event.timestamp).toLocaleTimeString(undefined, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      })}  ${event.data.tag}`;
      button.onclick = () => {
        selectedIndex = index;
        ui('#detail').textContent = JSON.stringify(event, null, 2);
        describeEvent(event);
        showDeliveryTiming(event);
      };
      list.append(button);
    });
  if (semantic.length && selectedIndex < 0) {
    const latest = semantic[semantic.length - 1];
    ui('#detail').textContent = JSON.stringify(latest, null, 2);
    describeEvent(latest);
    showDeliveryTiming(latest);
  }
  ui('#stop').disabled = !ready || !recording;
  ui('#start').disabled = !ready || recording;
}

function showDeliveryTiming(event) {
  const receivedAt = receivedTimes.get(event);
  ui('#delivery-timing').textContent = `rrweb timestamp: ${
    event.timestamp
  } · Batch decoded: ${receivedAt} · Delivery delay: ${receivedAt - event.timestamp} ms`;
}

function observeVisibilityTiming(event) {
  if (event.type !== 'visibilitychange' && event.target !== window) return;
  const observedAt = Date.now();
  const browserAt = event.timeStamp > 1e12 ? event.timeStamp : performance.timeOrigin + event.timeStamp;
  visibilityTiming.push({
    type: event.type,
    state: document.visibilityState,
    focused: document.hasFocus(),
    trusted: event.isTrusted,
    browserAt: Math.round(browserAt),
    observedAt,
    handlerDelayMs: Math.round(observedAt - browserAt),
  });
  if (visibilityTiming.length > 100) visibilityTiming.shift();
  ui('#visibility-timing').textContent = JSON.stringify(visibilityTiming.slice(-12), null, 2);
}
document.addEventListener('visibilitychange', observeVisibilityTiming, true);
window.addEventListener('focus', observeVisibilityTiming);
window.addEventListener('blur', observeVisibilityTiming);

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
    const receivedAt = Date.now();
    for (const event of decoded) {
      receivedTimes.set(event, receivedAt);
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

const palette = document.querySelector('#command-palette');
document.querySelector('#open-palette').onclick = () => palette.showModal();
document.querySelector('#close-palette').onclick = () => palette.close();
document.addEventListener('keydown', (event) => {
  if (event.composedPath().includes(document.querySelector('#inspector'))) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (!palette.open) palette.showModal();
  }
});
let resourceAttempt = 0;
document.querySelector('#fail-resources').onclick = () => {
  const fixtures = document.querySelector('#resource-fixtures');
  fixtures.replaceChildren();
  const base = `/api/status/404/semantic-missing/${++resourceAttempt}`;
  for (let i = 0; i < 2; i++) {
    const img = document.createElement('img');
    img.alt = 'Intentional broken image';
    img.src = `${base}/image.png?private=RESOURCE_QUERY_SECRET`;
    fixtures.append(img);
  }
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `${base}/theme.css`;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `${base}/app.js`;
  const style = document.createElement('style');
  const family = `SemanticMissing${resourceAttempt}`;
  style.textContent = `@font-face { font-family: "${family}"; src: url("${base}/font.woff2"); }`;
  const text = document.createElement('span');
  text.style.fontFamily = family;
  text.textContent = 'Intentional font failure';
  fixtures.append(css, script, style, text);
  // The rejection is expected; document.fonts reports the failure to the recorder.
  void document.fonts?.load(`16px "${family}"`).catch(() => undefined);
};

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
  get visibilityTiming() {
    return visibilityTiming;
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
    enableUrlChangePolling: params.get('urlPolling') === 'true',
    urlChangePollingInterval: 100,
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
              sr_interaction_config: { enabled: params.get('heatmaps') === 'true', trackEveryNms: 0 },
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
