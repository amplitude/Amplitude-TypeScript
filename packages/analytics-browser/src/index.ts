/* eslint-disable @typescript-eslint/unbound-method */
import client from './browser-client-factory';
export { createInstance } from './browser-client-factory';
export const {
  add,
  extendSession,
  flush,
  getDeviceId,
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
} = client;
export { runQueuedFunctions } from './utils/snippet-helper';
export { Revenue, Identify } from '@amplitude/analytics-core';
export * as Types from '@amplitude/analytics-types';
