/* eslint-disable @typescript-eslint/unbound-method */
// dummy patch analytics-browser to force GTM deploy
import client from './browser-client-factory';

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
