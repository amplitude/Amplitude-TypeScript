import { getGlobalScope } from '@amplitude/analytics-core';

export type WebEnvironment =
  | 'browser'
  | 'web_worker'
  | 'service_worker'
  | 'chrome_extension'
  | 'chrome_extension_service_worker'
  | 'node'
  | 'unknown';

type Scope = NonNullable<ReturnType<typeof getGlobalScope>>;

// All predicates take the already-resolved global scope so the whole classification
// reads one consistent object.

// Same check as core's isChromeExtension, on the resolved scope: extension pages,
// content scripts, and MV3 background workers all expose chrome.runtime.id.
const isChromeExtension = (scope: Scope): boolean => {
  return typeof (scope as { chrome?: { runtime?: { id?: unknown } } }).chrome?.runtime?.id === 'string';
};

// A service worker global, including an MV3 extension background worker.
// ServiceWorkerGlobalScope inherits from WorkerGlobalScope, so isWebWorker also matches
// here — getWebEnvironment checks this one first.
const isServiceWorker = (scope: Scope): boolean => {
  const ctor = (scope as { ServiceWorkerGlobalScope?: new () => unknown }).ServiceWorkerGlobalScope;
  return typeof ctor === 'function' && scope instanceof ctor;
};

// Dedicated / shared / service worker. `WorkerGlobalScope` is only exposed on worker
// globals, so its presence is already worker-specific; the instanceof check additionally
// rules out non-browser runtimes that expose web constructors on a server global.
const isWebWorker = (scope: Scope): boolean => {
  const ctor = (scope as { WorkerGlobalScope?: new () => unknown }).WorkerGlobalScope;
  return typeof ctor === 'function' && scope instanceof ctor;
};

// Main-thread only: workers have no document.
const isBrowser = (scope: Scope): boolean => {
  return typeof (scope as { document?: unknown }).document !== 'undefined';
};

// Checks process.versions.node rather than bare process: bundlers commonly inject a
// process.env shim into browser builds, but not versions.node.
const isNode = (scope: Scope): boolean => {
  return typeof (scope as { process?: { versions?: { node?: unknown } } }).process?.versions?.node === 'string';
};

/**
 * Classifies the JS runtime for diagnostics. The check order is load-bearing:
 * - service worker before web worker: ServiceWorkerGlobalScope inherits from WorkerGlobalScope
 * - browser after the extension split: extension pages and content scripts have a `document`
 * - browser before node: jsdom exposes both `document` and `process.versions.node`
 */
export function getWebEnvironment(): WebEnvironment {
  const scope = getGlobalScope();
  if (!scope) {
    return 'unknown';
  }
  const isExtension = isChromeExtension(scope);
  if (isServiceWorker(scope)) {
    return isExtension ? 'chrome_extension_service_worker' : 'service_worker';
  }
  if (isWebWorker(scope)) {
    return 'web_worker';
  }
  if (isBrowser(scope)) {
    return isExtension ? 'chrome_extension' : 'browser';
  }
  if (isNode(scope)) {
    return 'node';
  }
  return 'unknown';
}
