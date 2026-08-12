// Talks to the runner extension, which is the only thing that can instrument a site this page has no
// access to.
//
// The channel is window.postMessage rather than chrome.runtime.sendMessage: the extension's content
// script sits on this page and relays messages to its service worker, which means this page needs no
// extension ID and the extension needs no externally_connectable entry. It also means the extension can
// announce itself, so the button can tell "not installed" from "not responding".
const REQUEST_SOURCE = 'amplitude-configurator';
const RESPONSE_SOURCE = 'amplitude-configurator-extension';

// Set by the extension's bridge content script once it has loaded.
const MARKER = 'amplitudeConfigurator';

const RESPONSE_TIMEOUT = 5000;

export function extensionVersion() {
  return document.documentElement.dataset[MARKER];
}

// A configuration crosses into the extension as JSON, which has nowhere to put a RegExp. The matching
// reviver lives in the extension's inject.js — the two have to agree on this shape.
export function toJsonSafe(value) {
  if (value instanceof RegExp) {
    return { __regex: value.source, __flags: value.flags };
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toJsonSafe(nested)]));
  }
  return value;
}

export function requestRun(payload) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const finish = (settle, value) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      settle(value);
    };
    const onMessage = (event) => {
      if (event.source !== window || event.data?.source !== RESPONSE_SOURCE || event.data.id !== id) {
        return;
      }
      if (event.data.error) {
        finish(reject, new Error(event.data.error));
      } else {
        finish(resolve, event.data.result);
      }
    };
    const timer = setTimeout(
      () => finish(reject, new Error('The extension did not respond. Try reloading it at chrome://extensions.')),
      RESPONSE_TIMEOUT,
    );
    window.addEventListener('message', onMessage);
    window.postMessage({ source: REQUEST_SOURCE, id, action: 'run-on-url', payload }, window.location.origin);
  });
}
