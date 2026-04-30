/* eslint-disable @typescript-eslint/unbound-method */
// dummy patch analytics-browser to force GTM deploy
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
  setIdentity,
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
  _setDiagnosticsSampleRate,
  _enableRequestBodyCompressionExperimental,
} = client;
export { AmplitudeBrowser } from './browser-client';
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';

export { trackVideo, type VideoCaptureOptions } from './video-capture/video-capture';

// Export types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
export * as Types from './types';
