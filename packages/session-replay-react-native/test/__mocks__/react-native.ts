// __mocks__/react-native.ts

// Both native SDKs keep a single `customSessionId` string, seeded at setup and
// replaced by setCustomSessionId. The mock holds it so `getSessionId()`, which
// now reads back through the bridge, can be exercised end to end.
let customSessionId = '-1';

const ampNativeSessionReplay = {
  setup: jest.fn((config: { customSessionId: string }) => {
    customSessionId = config.customSessionId;
    return Promise.resolve();
  }),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  teardown: jest.fn(() => {
    customSessionId = '-1';
    return Promise.resolve();
  }),
  flush: jest.fn().mockResolvedValue(undefined),
  getSessionId: jest.fn().mockResolvedValue(12345),
  setDeviceId: jest.fn().mockResolvedValue(undefined),
  setSessionId: jest.fn().mockResolvedValue(undefined),
  setCustomSessionId: jest.fn((id: string) => {
    customSessionId = id;
    return Promise.resolve();
  }),
  getCustomSessionId: jest.fn(() => Promise.resolve(customSessionId)),
  setOptOut: jest.fn().mockResolvedValue(undefined),
};

// Resolve on both architectures: NativeModules (old arch) and TurboModuleRegistry
// (new arch) return the same module instance.
export const NativeModules = {
  AMPNativeSessionReplay: ampNativeSessionReplay,
};

export const TurboModuleRegistry = {
  get: jest.fn(() => ampNativeSessionReplay),
  getEnforcing: jest.fn(() => ampNativeSessionReplay),
};

export const Platform = {
  OS: 'ios' as 'ios' | 'android',
  select: jest.fn((options: { ios?: string; android?: string; default?: string }) => {
    return options.ios || options.default || '';
  }),
};

export const requireNativeComponent = jest.fn((_componentName: string) => _componentName);
