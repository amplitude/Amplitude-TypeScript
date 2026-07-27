import { getGlobalScope } from '../global-scope';

export function isChromeExtension(): boolean {
  const globalScope = getGlobalScope() as { chrome?: { runtime?: { id?: string } } };
  return typeof globalScope?.chrome?.runtime?.id === 'string';
}

export function isReactNative(): boolean {
  const globalScope = getGlobalScope() as { navigator?: { product?: string } };
  return globalScope?.navigator?.product === 'ReactNative';
}

export function isBrowser(): boolean {
  const globalScope = getGlobalScope() as { document?: unknown } | undefined;
  return typeof globalScope?.document !== 'undefined';
}

// Client SDKs (browser or React Native) can recover from an offline state on their own —
// via a network reconnect, a page reload, or an app relaunch. The Node (server) SDK is a
// long-lived process with no such recovery.
export function isClientSide(): boolean {
  return isReactNative() || isBrowser();
}
