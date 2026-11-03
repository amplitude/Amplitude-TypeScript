import type { InterfaceSignalState } from '../src/native-module';

describe('interface signal subscriptions', () => {
  it.each(['ios', 'android'])('initializes each subscriber on %s and supports cleanup', (platform) => {
    const callbacks: ((signal: unknown) => void)[] = [];
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, callback: (signal: unknown) => void) => {
      callbacks.push(callback);
      return { remove };
    });
    const nativeModule = { getInterfaceSignalState: jest.fn(), addListener: jest.fn(), removeListeners: jest.fn() };
    const emitter = jest.fn(() => ({ addListener }));

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: platform, select: () => '' },
        NativeModules: { PluginSessionReplayReactNative: nativeModule },
        NativeEventEmitter: emitter,
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- isolateModules needs a fresh require
      const { addInterfaceSignalListener } = require('../src/native-module') as typeof import('../src/native-module');
      const first = jest.fn();
      const second = jest.fn();
      const subscription = addInterfaceSignalListener(first);
      addInterfaceSignalListener(second);

      expect(emitter.mock.calls).toEqual(platform === 'ios' ? [[nativeModule], [nativeModule]] : [[], []]);
      for (const listener of [first, second]) {
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({ type: 'stateChanged', timestamp: expect.any(Number) });
      }
      const signal = { type: 'interfaceChanged', timestamp: 123 };
      callbacks.forEach((callback) => callback(signal));
      expect(first).toHaveBeenLastCalledWith(signal);
      expect(second).toHaveBeenLastCalledWith(signal);
      subscription.remove();
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});

describe('public interface-signal API', () => {
  it.each(['ios', 'android'])('reads current native state through the public API on %s', async (platform) => {
    const state: InterfaceSignalState = { isProviding: true, sessionId: 'custom-session', deviceId: 'device' };
    const readState = jest.fn().mockResolvedValue(state);
    const nativeModule = { getInterfaceSignalState: readState, addListener: jest.fn(), removeListeners: jest.fn() };
    let read: () => Promise<unknown> = () => Promise.resolve(null);
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        Platform: { OS: platform, select: () => '' },
        NativeModules: { PluginSessionReplayReactNative: nativeModule },
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
          NativeModules: { PluginSessionReplayReactNative: nativeModule },
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
