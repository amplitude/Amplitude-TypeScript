/* eslint-disable @typescript-eslint/unbound-method */
import { createInstance } from './unified-client-factory';

const client = createInstance();

export { createInstance } from './unified-client-factory';
export type { UnifiedClient, UnifiedOptions, UnifiedSharedOptions } from './types';

export const {
  add,
  experiment,
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
  sessionReplay,
  setDeviceId,
  setGroup,
  setOptOut,
  setSessionId,
  setUserId,
  track,
  trackScreenView,
  trackScreenViewOnNavigationStateChange,
} = client;

export { AmpMaskView } from '@amplitude/plugin-session-replay-react-native';
export { Identify, Revenue, Types } from '@amplitude/analytics-react-native';
