describe('interface signal subscriptions', () => {
  it.each(['ios', 'android'])('initializes each subscriber on %s and supports cleanup', (platform) => {
    const callbacks: ((signal: unknown) => void)[] = [];
    const remove = jest.fn();
    const addListener = jest.fn((_event: string, callback: (signal: unknown) => void) => {
      callbacks.push(callback);
      return { remove };
    });
    const nativeModule = {};
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
