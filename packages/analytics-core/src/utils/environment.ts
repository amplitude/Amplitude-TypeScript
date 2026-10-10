import { getGlobalScope } from '../global-scope';

export function isChromeExtension(): boolean {
  const globalScope = getGlobalScope() as { chrome?: { runtime?: { id?: string } } };
  return typeof globalScope?.chrome?.runtime?.id === 'string';
}

export function isReactNative(): boolean {
  const globalScope = getGlobalScope() as { navigator?: { product?: string } };
  return globalScope?.navigator?.product === 'ReactNative';
}

// Main-thread browser only. Workers have no `document` — use isWebWorker() for those.
export function isBrowser(): boolean {
  const globalScope = getGlobalScope() as { document?: unknown } | undefined;
  return typeof globalScope?.document !== 'undefined';
}

// True inside a dedicated / shared / service worker, e.g. a Manifest V3 extension background
// worker. `WorkerGlobalScope` is only exposed on worker globals, so its presence is already
// worker-specific; the instanceof check additionally rules out non-browser runtimes that expose
// web constructors on a server global.
export function isWebWorker(): boolean {
  const globalScope = getGlobalScope() as { WorkerGlobalScope?: new () => unknown } | undefined;
  if (!globalScope) {
    return false;
  }
  const workerGlobalScope = globalScope.WorkerGlobalScope;
  return typeof workerGlobalScope === 'function' && globalScope instanceof workerGlobalScope;
}

export function isClientSide(): boolean {
  return isReactNative() || isBrowser() || isWebWorker() || isChromeExtension();
}
