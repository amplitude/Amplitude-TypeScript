describe('NativeSessionReplay module resolution', () => {
  it('subscribes to typed native interface signals and exposes listener cleanup', () => {
    const listener = jest.fn();
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, callback: typeof listener) => {
      callback({ type: 'interfaceChanged', timestamp: 123 });
      return { remove };
    });
    const nativeModule = { addListener: jest.fn(), removeListeners: jest.fn() };
    const emitter = jest.fn(() => ({ addListener }));

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: { get: () => nativeModule },
        NativeEventEmitter: emitter,
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { addInterfaceSignalListener } = require('../src/native-module') as typeof import('../src/native-module');
      const subscription = addInterfaceSignalListener(listener);

      expect(emitter).toHaveBeenCalledWith(nativeModule);
      expect(addListener).toHaveBeenCalledWith('AMPNativeSessionReplayInterfaceSignal', listener);
      expect(listener).toHaveBeenCalledWith({ type: 'interfaceChanged', timestamp: 123 });
      subscription.remove();
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  it('throws a descriptive linking error on first use when the native module is unavailable', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: { get: () => null },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { NativeSessionReplay } = require('../src/native-module') as typeof import('../src/native-module');

      expect(() => NativeSessionReplay.setCustomSessionId('test-id')).toThrow("doesn't seem to be linked");
    });
  });

  it('resolves the native module through the codegen spec when it is linked', () => {
    const setCustomSessionId = jest.fn().mockResolvedValue(undefined);

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { select: () => '' },
        TurboModuleRegistry: { get: () => ({ setCustomSessionId }) },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { NativeSessionReplay } = require('../src/native-module') as typeof import('../src/native-module');

      void NativeSessionReplay.setCustomSessionId('test-id');
      expect(setCustomSessionId).toHaveBeenCalledWith('test-id');
    });
  });
});
