// __mocks__/react-native.ts
const ampNativeSessionReplay = {
  setup: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  flush: jest.fn().mockResolvedValue(undefined),
  getSessionId: jest.fn().mockResolvedValue(12345),
  getSessionReplayProperties: jest.fn().mockResolvedValue({ replayId: 'test-id' }),
  setDeviceId: jest.fn().mockResolvedValue(undefined),
  setSessionId: jest.fn().mockResolvedValue(undefined),
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

export const UIManager = {
  hasViewManagerConfig: jest.fn((_name: string) => true),
};
