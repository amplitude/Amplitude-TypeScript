import type { ReactNativeClient } from '@amplitude/analytics-types';

const mockReactNativeClient: ReactNativeClient = {
  init: jest.fn(),
  add: jest.fn(),
  remove: jest.fn(),
  track: jest.fn(),
  logEvent: jest.fn(),
  identify: jest.fn(),
  groupIdentify: jest.fn(),
  setGroup: jest.fn(),
  revenue: jest.fn(),
  flush: jest.fn(),
  getUserId: jest.fn(),
  setUserId: jest.fn(),
  getDeviceId: jest.fn(),
  setDeviceId: jest.fn(),
  reset: jest.fn(),
  getSessionId: jest.fn(),
  setSessionId: jest.fn(),
  extendSession: jest.fn(),
  setOptOut: jest.fn(),
};

export default mockReactNativeClient;
