import { getGlobalScope } from '../global-scope';

export function isChromeExtension(): boolean {
  const globalScope = getGlobalScope() as { chrome?: { runtime?: { id?: string } } };
  return typeof globalScope?.chrome?.runtime?.id === 'string';
}

export function isReactNative(): boolean {
  const globalScope = getGlobalScope() as { navigator?: { product?: string } };
  return globalScope?.navigator?.product === 'ReactNative';
}