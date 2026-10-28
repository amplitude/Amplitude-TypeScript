/* eslint-disable @typescript-eslint/unbound-method */
import client from './browser-client-core-factory';
export { createInstance } from './browser-client-core-factory';
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
  setIdentity,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
  _setDiagnosticsSampleRate,
} = client;
export { AmplitudeBrowserCore as AmplitudeBrowser } from './browser-client-core';
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';

// Export types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
// (dummy comment to trigger an analytics-browser release)
export * as Types from './types';
