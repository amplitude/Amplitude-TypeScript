/* eslint-disable @typescript-eslint/unbound-method */
import client from './react-native-client';
export { createInstance } from './react-native-client';
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
  setUserId,
  track,
  extendSession,
} = client;
export { Revenue, Identify } from '@amplitude/analytics-core';
// Hack - react-native apps have trouble with:
// export * as Types from '@amplitude/analytics-types
import * as Types from '@amplitude/analytics-types';
export { Types };
