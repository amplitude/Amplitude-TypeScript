export {
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
} from './react-native-client';
export { Revenue, Identify } from '@amplitude/analytics-core';
// Hack - react-native apps have trouble with:
// export * as Types from '@amplitude/analytics-types
import * as Types from '@amplitude/analytics-types';
export { Types };
