/* eslint-disable @typescript-eslint/unbound-method */
import * as engagement from '@amplitude/plugin-engagement-react-native';
import { createInstance } from './unified-client-factory';

const client = createInstance();

export { createInstance } from './unified-client-factory';
export type { EngagementOptions, EngagementPlugin, UnifiedClient, UnifiedOptions, UnifiedSharedOptions } from './types';

export const {
  add,
  engagement: getEngagement,
  experiment,
  extendSession,
  flush,
  getDeviceId,
  getSessionId,
  getUserId,
  groupIdentify,
  identify,
  init,
  initAll,
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

export { engagement };
export { AmpMaskView } from '@amplitude/plugin-session-replay-react-native';
export type { ExperimentPluginConfig, IExperimentClient } from '@amplitude/plugin-experiment-react-native';
export { LogLevel } from '@amplitude/analytics-core';
export { ampCapture, Identify, Revenue, Types } from '@amplitude/analytics-react-native';
