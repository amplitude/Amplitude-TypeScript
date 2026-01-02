/* eslint-disable @typescript-eslint/unbound-method */
import client from './unified-client-factory';
export { createInstance } from './unified-client-factory';
export const {
  _setDiagnosticsSampleRate,
  initAll,
  experiment,
  sessionReplay,
  add,
  extendSession,
  flush,
  getDeviceId,
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
  setOptOut,
  setSessionId,
  setTransport,
  setUserId,
  track,
} = client;
export { Types, Revenue, Identify } from '@amplitude/analytics-browser';
