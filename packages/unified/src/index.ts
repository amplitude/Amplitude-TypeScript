/* eslint-disable @typescript-eslint/unbound-method */
import client from './unified-client-factory';
export { createInstance } from './unified-client-factory';
export const {
  _setDiagnosticsSampleRate,
  _enableRequestBodyCompressionExperimental,
  initAll,
  experiment,
  engagement,
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
