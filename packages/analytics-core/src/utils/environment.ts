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

export function isClientSide(): boolean {
  return isReactNative() || isBrowser();
}
