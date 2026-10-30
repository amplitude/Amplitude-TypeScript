import * as sessionReplay from '@amplitude/session-replay-browser';

const params = new URLSearchParams(location.search);
const events = [];
const errors = [];
let ready = false;
const output = document.querySelector('#events');
const status = document.querySelector('#status');
const report = (error) => {
  errors.push(String(error));
  status.textContent = String(error);
};

async function receiveBatch({ body, headers }) {
  let raw = body;
  if (typeof body !== 'string') {
    const gzip = Object.entries(headers).some(
      ([key, value]) => key.toLowerCase() === 'content-encoding' && value === 'gzip',
    );
    const stream = new Blob([body]).stream();
    raw = await new Response(gzip ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).text();
  }
  for (const entry of JSON.parse(raw).events) {
    const event = typeof entry === 'string' ? JSON.parse(entry) : entry;
    if (event.type === 5 && event.data?.tag?.startsWith('amp-semantic/')) events.push(event);
  }
  // Bound the inspector's retained data independently of the SDK.
  if (events.length > 1000) events.splice(0, events.length - 1000);
  output.textContent = JSON.stringify(events, null, 2);
  return new Response('{"code":200}', { status: 200 });
}

async function flush() {
  if (!ready) return;
  // Move the current replay sequence into the public flush queue.
  window.dispatchEvent(new Event('blur'));
  await sessionReplay.flush(false);
}
async function stop() {
  sessionReplay.stop();
  await flush();
  status.textContent = 'Recording stopped';
}
async function start() {
  await sessionReplay.start().promise;
  status.textContent = 'Recording; switch tabs and flush to inspect events';
}
document.querySelector('#flush').onclick = () => void flush().catch(report);
document.querySelector('#stop').onclick = () => void stop().catch(report);
document.querySelector('#start').onclick = () => void start().catch(report);
window.semanticHarness = {
  get ready() {
    return ready;
  },
  events,
  errors,
  flush,
  stop,
  start,
};

async function boot() {
  const rate = Number(params.get('sampleRate') ?? 1);
  const families = Object.fromEntries(
    (params.get('disabled') ?? '')
      .split(',')
      .filter((name) => ['context', 'visibility'].includes(name))
      .map((name) => [name, false]),
  );
  await sessionReplay.init('semantic-local-test-key', {
    deviceId: 'semantic-local-device',
    sessionId: Date.now(),
    sampleRate: 1,
    storeType: 'memory',
    useWebWorker: false,
    logLevel: 0,
    semanticCapture: { enabled: params.get('enabled') !== 'false', sampleRate: rate, families },
    privacyConfig: { defaultMaskLevel: 'medium' },
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
        { status: 200 },
      ),
  }).promise;
  ready = true;
  status.textContent = 'Ready; switch tabs and flush to inspect events';
}
void boot().catch(report);
