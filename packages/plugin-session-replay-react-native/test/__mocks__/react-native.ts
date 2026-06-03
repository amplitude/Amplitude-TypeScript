// __mocks__/react-native.ts
// Mirrors the standalone package's mock. The plugin now delegates to the
// standalone's native module (`AMPNativeSessionReplay`) and mask component
// (`AMPMaskComponentView`), so the mock exposes those names.
export const NativeModules = {
  AMPNativeSessionReplay: {
    setup: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    getSessionId: jest.fn().mockResolvedValue(12345),
    getSessionReplayProperties: jest.fn().mockResolvedValue({ replayId: 'test-id' }),
    setDeviceId: jest.fn().mockResolvedValue(undefined),
    setSessionId: jest.fn().mockResolvedValue(undefined),
  },
};

export const Platform = {
  OS: 'ios' as 'ios' | 'android',
  select: jest.fn((options: { ios?: string; android?: string; default?: string }) => {
    return options.ios || options.default || '';
  }),
};

export const requireNativeComponent = jest.fn((_componentName: string) => _componentName);
