/* eslint-disable @typescript-eslint/unbound-method */
import client from './unified-client-factory';
export { createInstance } from './unified-client-factory';
export type { UnifiedClient, UnifiedOptions, UnifiedSharedOptions } from './unified';
export const {
  _setDiagnosticsSampleRate,
  initAll,
  experiment,
  sessionReplay,
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
} = client;
export { Types, Revenue, Identify } from '@amplitude/analytics-browser';
