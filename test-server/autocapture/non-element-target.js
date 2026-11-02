import { isElementPointerCursor } from '@amplitude/plugin-autocapture-browser/src/helpers';
import { DataExtractor } from '@amplitude/plugin-autocapture-browser/src/data-extractor';
import { frustrationPlugin } from '@amplitude/plugin-autocapture-browser/src/frustration-plugin';

document.querySelector('#browser').textContent = navigator.userAgent;
document.querySelector('#native-probe').addEventListener('click', () => {
  const root = document.documentElement;
  const previousDisplay = root.style.display;
  const restore = () => {
    root.style.display = previousDisplay;
  };
  const timer = setTimeout(() => {
    window.removeEventListener('pointerdown', record, true);
    restore();
    document.querySelector('#native-result').textContent = 'Timed out; page restored.';
  }, 15000);
  const record = (event) => {
    clearTimeout(timer);
    restore();
    document.querySelector('#native-result').textContent =
      `type=${event.type}; target=${event.target?.constructor.name}; ` +
      `isTrusted=${event.isTrusted}; currentTarget=${event.currentTarget?.constructor.name}`;
    console.log('Native hidden-root probe:', {
      target: event.target,
      isTrusted: event.isTrusted,
      currentTarget: event.currentTarget,
    });
  };
  window.addEventListener('pointerdown', record, { capture: true, once: true });
  root.style.display = 'none';
});

// Frozen pre-fix implementation from helpers.ts at c56d5f129. Keep this separate
// from the imported local helper so the original failure remains reproducible
// after the local source is fixed. This listener intentionally has no catch.
const originalIsElementPointerCursor = (element, actionType) => {
  const computedStyle = window?.getComputedStyle?.(element);
  return computedStyle?.getPropertyValue('cursor') === 'pointer' && actionType === 'click';
};
document.querySelector('#uncaught').addEventListener('click', () => {
  const reportError = (event) => {
    document.querySelector('#uncaught-result').textContent = `Host-page error event: ${event.message}`;
    document.querySelector('#uncaught-result').className = 'error';
  };
  window.addEventListener('error', reportError, { once: true });
  document.addEventListener(
    'pointerdown',
    (event) => {
      originalIsElementPointerCursor(event.target, 'click');
    },
    { once: true },
  );
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
const extractor = new DataExtractor({});
const control = document.querySelector('#control');
const cases = [
  ['Document', document],
  ['Text (inside button)', control.firstChild],
  ['Window', window],
  ['HTML button (control)', control],
  ['SVG (control)', document.querySelector('#svg-control')],
];

function addRow(table, values, error = false) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.appendChild(cell);
  }
  row.lastChild.className = error ? 'error' : 'ok';
  document.querySelector(table).appendChild(row);
}

// Use a dedicated event listener for each case so event.target is assigned by
// the browser, rather than a mocked object or a TypeScript cast.
function dispatchTo(target, listener) {
  target.addEventListener('pointerdown', listener, { once: true });
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

async function run() {
  document.querySelector('#helper-results').replaceChildren();
  document.querySelector('#extractor-results').replaceChildren();
  document.querySelector('#status').textContent = 'Running…';
  for (const [label, target] of cases) {
    dispatchTo(target, (event) => {
      try {
        const result = isElementPointerCursor(event.target, 'click');
        addRow('#helper-results', [label, event.target.constructor.name, String(result)]);
      } catch (error) {
        console.error(`Local helper, ${label}:`, error);
        addRow('#helper-results', [label, event.target.constructor.name, `${error.name}: ${error.message}`], true);
      }
    });
    dispatchTo(target, (event) => {
      try {
        const result = extractor.addAdditionalEventProperties(event, 'click', ['button'], 'data-amp-', true);
        addRow('#extractor-results', [
          label,
          result.closestTrackedAncestor
            ? `Returned normally; tracked ${result.closestTrackedAncestor.tagName}`
            : 'Returned normally; no tracked ancestor (dropped downstream)',
        ]);
      } catch (error) {
        addRow('#extractor-results', [label, `${error.name}: ${error.message}`], true);
      }
    });
  }

  const errors = [];
  const tracks = [];
  const onError = (event) => errors.push(event.message);
  window.addEventListener('error', onError);
  const plugin = frustrationPlugin({ rageClicks: true, deadClicks: true, errorClicks: false });
  try {
    await plugin.setup(
      { apiKey: 'local-sdk-412', loggerProvider: console },
      {
        track: (...args) => tracks.push(args),
      },
    );
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    // Observable errors can be surfaced asynchronously. The wait also keeps
    // the listeners alive long enough to observe a host-page error event.
    await new Promise((resolve) => setTimeout(resolve, 150));
    document.querySelector('#plugin-results').textContent =
      `document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))\n` +
      `Host-page uncaught errors: ${errors.length}\n` +
      `Amplitude events: ${tracks.length}\n` +
      (errors.join('\n') || 'No uncaught error reached the host page.');
  } finally {
    await plugin.teardown();
    window.removeEventListener('error', onError);
  }
  document.querySelector('#status').textContent = 'Complete';
}

document.querySelector('#run').addEventListener('click', run);
document.querySelector('#status').textContent = 'Ready';
