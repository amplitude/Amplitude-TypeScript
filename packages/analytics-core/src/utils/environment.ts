import { getGlobalScope } from '../global-scope';

export function isChromeExtension(): boolean {
  const globalScope = getGlobalScope() as { chrome?: { runtime?: { id?: string } } };
  return typeof globalScope?.chrome?.runtime?.id === 'string';
}
