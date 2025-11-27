/* eslint-disable @typescript-eslint/unbound-method */
import { registerSdkLoaderMetadata } from '@amplitude/analytics-core';
import client from './browser-client-factory';
export { createInstance } from './browser-client-factory';
export const {
  add,
  extendSession,
  flush,
  getDeviceId,
  getIdentity,
  getOptOut,
  getSessionId,
  getUserId,
  groupIdentify,
  identify,
  init,
  logEvent,
  remove,
  reset,
  revenue,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
  _setDiagnosticsSampleRate,
} = client;
export { AmplitudeBrowser } from './browser-client';
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';

const stackFrameHints = captureStackFrameHints();
if (stackFrameHints.length) {
  registerSdkLoaderMetadata({ stackFrameHints });
}

function captureStackFrameHints(): string[] {
  try {
    throw new Error('__AMPLITUDE_SDK_STACK__');
  } catch (error) {
    const stack = (error as Error).stack;
    console.log('stack', stack);
    if (!stack) {
      return [];
    }
    return stack
      .split('\n')
      .map(extractStackHint)
      .filter((value): value is string => Boolean(value))
      .slice(0, 5);
  }
}

function extractStackHint(line?: string): string | undefined {
  if (!line) {
    return undefined;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

// Export types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
export * as Types from './types';
