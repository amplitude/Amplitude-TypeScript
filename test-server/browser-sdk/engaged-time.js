import { createInstance } from '@amplitude/analytics-browser';
const element = (id) => document.getElementById(id);
const input = (id) => element(id);
const sdk = createInstance();
let requests = 0;
let finals = 0;
let article = 1;
let optedOut = false;
function visibility() {
  element('visibility').textContent = `${document.visibilityState} / ${document.hasFocus() ? 'focused' : 'blurred'}`;
}
document.addEventListener('visibilitychange', visibility);
window.addEventListener('focus', visibility);
window.addEventListener('blur', visibility);
visibility();
function showPayload(url, payload) {
  const body = payload;
  const events = [...body.events, ...(body.instant_events || [])];
  const event = events[events.length - 1];
  const engaged = event?.event_properties?.['[Amplitude] Engaged Time'];
  if (typeof engaged === 'number') element('engaged').textContent = `${(engaged / 1000).toFixed(2)} s`;
  finals += body.instant_events?.length || 0;
  element('finals').textContent = String(finals);
  element('requests').textContent = String(++requests);
  if (requests === 1) element('payloads').replaceChildren();
  const details = document.createElement('details');
  details.open = requests === 1;
  const summary = document.createElement('summary');
  const kind = body.instant_events?.length ? 'FINAL' : 'SNAPSHOT';
  const label = `#${requests} · ${kind} · ${new Date().toLocaleTimeString()} · ${event?.insert_id || ''}`;
  summary.textContent = `${label} · Sending…`;
  const pre = document.createElement('pre');
  const { api_key: omitted, ...safeBody } = body;
  pre.textContent = `${url}\n\n${JSON.stringify(safeBody, null, 2)}`;
  details.append(summary, pre);
  element('payloads').prepend(details);
  // Bound the inspector's memory during long-running demos.
  if (element('payloads').children.length > 100) element('payloads').lastElementChild?.remove();
  return (message) => {
    summary.textContent = `${label} · ${message}`;
  };
}
element('defaults').onclick = () => {
  input('threshold').value = '5000';
  input('heartbeat').value = '15000';
  input('timeout').value = '180000';
};
element('destination').onchange = () => {
  element('destination-note').textContent =
    input('destination').value === 'live'
      ? 'Live mode sends page views to Amplitude US using the provided API key. It requires a project with delayed-event support.'
      : 'Local mode makes real HTTP requests to this Vite server. The receiver only acknowledges payloads; it does not implement storage, ingestion, or fallback TTL.';
};
element('settings').onsubmit = async (event) => {
  event.preventDefault();
  const threshold = Number(input('threshold').value);
  const pulse = Number(input('heartbeat').value);
  const timeout = Number(input('timeout').value);
  const live = input('destination').value === 'live';
  const apiKey = input('api-key').value.trim();
  if (
    ![threshold, pulse, timeout].every((value) => Number.isFinite(value) && value > 0 && value <= 2147483647) ||
    pulse >= timeout ||
    timeout > 86400000
  ) {
    element('error').textContent =
      'Use positive durations, a heartbeat shorter than the inactivity timeout, and an inactivity timeout of at most 24 hours.';
    return;
  }
  if (live && !apiKey) {
    element('error').textContent = 'Enter an API key for the live destination.';
    return;
  }
  element('error').textContent = '';
  const options = {
    autocapture: {
      attribution: false,
      sessions: false,
      pageViews: {
        trackEngagedTime: {
          engagementThresholdMillis: threshold,
          heartbeatIntervalMillis: pulse,
          pageSessionTimeoutMillis: timeout,
        },
      },
      fileDownloads: false,
      formInteractions: false,
      elementInteractions: false,
    },
    fetchRemoteConfig: false,
    identityStorage: 'none',
    flushIntervalMillis: 100,
    serverUrl: live ? undefined : `${location.origin}/api/engaged-time/2/httpapi`,
  };
  void sdk.add({
    name: 'engaged-time-demo-http-inspector',
    type: 'before',
    async setup(config) {
      const transport = config.transportProvider;
      config.transportProvider = {
        async send(url, payload, compress) {
          const update = showPayload(url, payload);
          try {
            const response = await transport.send(url, payload, compress);
            update(response?.statusCode === 200 ? 'Accepted' : `Response ${response?.statusCode ?? 'unavailable'}`);
            return response;
          } catch (error) {
            update(`Failed: ${String(error)}`);
            throw error;
          }
        },
      };
    },
  }).promise;
  element('config').textContent = `amplitude.init(API_KEY, ${JSON.stringify(
    options,
    null,
    2,
  )});\n\n// Inspector forwards requests using the SDK's configured transport.`;
  element('start').disabled = true;
  try {
    await sdk.init(live ? apiKey : 'local-engaged-time-demo', options).promise;
    element('status').textContent = `SDK running · ${live ? 'Amplitude US' : 'local receiver'}`;
    for (const id of ['navigate', 'flush', 'optout', 'stop']) element(id).disabled = false;
    for (const control of element('settings').querySelectorAll('input, select, button')) control.disabled = true;
  } catch (error) {
    element('error').textContent = String(error);
    element('start').disabled = false;
  }
};
element('navigate').onclick = () => {
  article += 1;
  document.title = `Article ${article} · Engaged time`;
  history.pushState({}, '', `?article=${article}`);
  element('article-title').textContent = `Article ${article} · Another page view`;
};
element('flush').onclick = () => {
  void sdk.flush().promise;
};
element('optout').onclick = () => {
  optedOut = !optedOut;
  sdk.setOptOut(optedOut);
  element('optout').textContent = optedOut ? 'Opt in' : 'Opt out';
  element('status').textContent = optedOut
    ? 'Opted out · local engagement state discarded'
    : 'SDK running · interact to start a new view';
};
element('stop').onclick = async () => {
  await sdk.remove('@amplitude/plugin-page-view-tracking-browser').promise;
  await sdk.flush().promise;
  element('status').textContent = 'Page tracking stopped · reload to run again';
  for (const id of ['navigate', 'flush', 'optout', 'stop']) element(id).disabled = true;
};
