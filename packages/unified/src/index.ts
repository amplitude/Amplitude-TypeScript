/* eslint-disable @typescript-eslint/unbound-method */
import client from './unified-client-factory';
import { TransportTypeOrOptions } from '@amplitude/analytics-core';
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
  setUserId,
  track,
} = client;

export const setTransport: (transport: TransportTypeOrOptions) => void = client.setTransport;
export { Types, Revenue, Identify } from '@amplitude/analytics-browser';
