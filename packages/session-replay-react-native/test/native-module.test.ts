describe('NativeSessionReplay module resolution', () => {
  it('falls back to NativeModules when TurboModule lacks a method', () => {
    const legacySetCustom = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: {
          get: () => ({
            setup: jest.fn(),
            setDeviceId: jest.fn(),
          }),
        },
        NativeModules: {
          AMPNativeSessionReplay: {
            setCustomSessionId: legacySetCustom,
          },
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { NativeSessionReplay } = require('../src/native-module') as typeof import('../src/native-module');

      expect(typeof NativeSessionReplay.setCustomSessionId).toBe('function');
      void NativeSessionReplay.setCustomSessionId('test-id');
      expect(legacySetCustom).toHaveBeenCalledWith('test-id');
    });
  });
});
