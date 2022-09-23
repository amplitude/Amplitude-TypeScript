/* eslint-disable @typescript-eslint/unbound-method */
import client from './browser-client';
export { createInstance } from './browser-client';
export const {
  add,
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
export { runQueuedFunctions } from '@amplitude/analytics-browser';
export { Revenue, Identify } from '@amplitude/analytics-core';
export * as Types from '@amplitude/analytics-types';
