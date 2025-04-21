import client from './unified-client-factory';
export { createInstance } from './unified-client-factory';
// eslint-disable-next-line @typescript-eslint/unbound-method
export const {
  add,
  extendSession,
  flush,
  getDeviceId,
  getSessionId,
  getUserId,
  groupIdentify,
  identify,
  initAll,
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
export { Types } from '@amplitude/analytics-browser';
