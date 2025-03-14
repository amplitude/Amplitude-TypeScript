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

import {
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  IdentifyOperation,
  LogLevel,
  OfflineDisabled,
  RevenueProperty,
  ServerZone,
  SpecialEventType,
  Status,
} from '@amplitude/analytics-core';

export const Types = {
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  IdentifyOperation,
  LogLevel,
  OfflineDisabled,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  RevenueProperty,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  ServerZone,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  SpecialEventType,
  Status,
};
