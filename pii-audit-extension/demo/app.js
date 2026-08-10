// Demo API key — events are intercepted and never reach Amplitude when audit is active.
const API_KEY = '00000000000000000000000000000000';

const logEl = document.getElementById('log');
const captured = [];

window.addEventListener('message', (e) => {
  if (!e.data?.__piiAudit) return;
  if (e.data.kind === 'audit-active') {
    log('audit-active');
    return;
  }
  if (e.data.kind === 'network') {
    log('CAPTURED', e.data);
    captured.push(...(e.data.events ?? []));
  }
});

function log(...args) {
  console.log('[pii-audit demo]', ...args);
  logEl.textContent = JSON.stringify(captured, null, 2);
}

amplitude.init(API_KEY, undefined, {
  autocapture: { elementInteractions: true },
  defaultTracking: false,
});

document.getElementById('track-btn').addEventListener('click', () => {
  amplitude.track('Test Event', { email: 'm.chen@example.com' });
});
