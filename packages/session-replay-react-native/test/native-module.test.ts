describe('NativeSessionReplay module resolution', () => {
  it('uses the native module to subscribe on iOS and exposes listener cleanup', () => {
    const listener = jest.fn();
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, callback: typeof listener) => {
      callback({ type: 'interfaceChanged', timestamp: 123 });
      return { remove };
    });
    const nativeModule = { getInterfaceSignalState: jest.fn(), addListener: jest.fn(), removeListeners: jest.fn() };
    const emitter = jest.fn(() => ({ addListener }));

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'ios', select: () => '' },
        TurboModuleRegistry: { get: () => nativeModule },
        NativeEventEmitter: emitter,
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { addInterfaceSignalListener } = require('../src/native-module') as typeof import('../src/native-module');
      const subscription = addInterfaceSignalListener(listener);

      expect(emitter).toHaveBeenCalledWith(nativeModule);
      expect(addListener).toHaveBeenCalledWith('AMPNativeSessionReplayInterfaceSignal', listener);
      expect(listener).toHaveBeenCalledWith({ type: 'interfaceChanged', timestamp: 123 });
      expect(listener).toHaveBeenCalledTimes(1);
      subscription.remove();
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  it('subscribes without the native module on Android', () => {
    const listener = jest.fn();
    const addListener = jest.fn(() => ({ remove: jest.fn() }));
    const nativeModule = { getInterfaceSignalState: jest.fn(), addListener: jest.fn(), removeListeners: jest.fn() };
    const emitter = jest.fn(() => ({ addListener }));

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android', select: () => '' },
        TurboModuleRegistry: { get: () => nativeModule },
        NativeEventEmitter: emitter,
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { addInterfaceSignalListener } = require('../src/native-module') as typeof import('../src/native-module');
      addInterfaceSignalListener(listener);

      expect(emitter).toHaveBeenCalledWith();
      expect(addListener).toHaveBeenCalledWith('AMPNativeSessionReplayInterfaceSignal', listener);
      expect(listener).not.toHaveBeenCalled();
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

describe('public interface-signal API', () => {
  it.each(['ios', 'android'])('reads current native state through the public API on %s', async (platform) => {
    const state = { isProviding: true, sessionId: 'custom-session', deviceId: 'device' };
    const readState = jest.fn().mockResolvedValue(state);
    const nativeModule = { getInterfaceSignalState: readState, addListener: jest.fn(), removeListeners: jest.fn() };
    let read: () => Promise<unknown> = () => Promise.resolve(null);
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: platform, select: () => '' },
        TurboModuleRegistry: { get: () => nativeModule },
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      read = (require('../src/native-module') as typeof import('../src/native-module')).getInterfaceSignalState;
    });
    await expect(read()).resolves.toBe(state);
    expect(readState).toHaveBeenCalledTimes(1);
  });

  it.each(['unlinked', 'old binary', 'missing event support'])(
    'returns unavailable state and a no-op subscription for %s',
    async (scenario) => {
      const nativeModule =
        scenario === 'unlinked'
          ? null
          : scenario === 'old binary'
          ? {}
          : {
              getInterfaceSignalState: jest.fn(),
            };
      const emitter = jest.fn();
      const listener = jest.fn();
      let read: () => Promise<unknown> = () => Promise.resolve(null);
      jest.isolateModules(() => {
        jest.doMock('react-native', () => ({
          Platform: { OS: 'ios', select: () => '' },
          TurboModuleRegistry: { get: () => nativeModule },
          NativeEventEmitter: emitter,
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const api = require('../src/native-module') as typeof import('../src/native-module');
        read = api.getInterfaceSignalState;
        const subscription = api.addInterfaceSignalListener(listener);
        subscription.remove();
      });
      await expect(read()).resolves.toBeNull();
      expect(listener).not.toHaveBeenCalled();
      expect(emitter).not.toHaveBeenCalled();
    },
  );
});
