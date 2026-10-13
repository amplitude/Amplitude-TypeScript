// Demo API key — events are intercepted and never reach Amplitude when audit is active.
const API_KEY = '00000000000000000000000000000000';

const loginView = document.getElementById('login-view');
const accountView = document.getElementById('account-view');
const logEl = document.getElementById('log');
const taxIdDisplay = document.getElementById('tax-id-display');
const captured = [];

let taxRevealed = false;
const MASKED_TAX = '•••-••-6789';
const FULL_TAX = '123-45-6789';

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

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  loginView.classList.add('hidden');
  accountView.classList.remove('hidden');
  amplitude.track('Login', { email: document.getElementById('username').value });
});

document.getElementById('logout-btn').addEventListener('click', () => {
  accountView.classList.add('hidden');
  loginView.classList.remove('hidden');
});

document.getElementById('reveal-btn').addEventListener('click', () => {
  taxRevealed = !taxRevealed;
  taxIdDisplay.textContent = taxRevealed ? FULL_TAX : MASKED_TAX;
  document.getElementById('reveal-btn').textContent = taxRevealed ? 'Hide SSN' : 'Reveal full SSN';
});

document.getElementById('track-btn').addEventListener('click', () => {
  amplitude.track('Test Event', {
    email: document.getElementById('billing-email').value,
    card: document.getElementById('card-number').value,
  });
});

document.getElementById('autocapture-btn').addEventListener('click', () => {
  amplitude.track('Billing Updated', {
    holder: document.getElementById('holder-name').textContent,
    billing_email: document.getElementById('billing-email').value,
  });
});
