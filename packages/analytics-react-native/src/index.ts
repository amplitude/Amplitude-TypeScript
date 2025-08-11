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

// Export types to maintain backward compatibility with `analytics-types`.
// In the next major version, only export customer-facing types to reduce the public API surface.
import * as Types from './types';
export { Types };
