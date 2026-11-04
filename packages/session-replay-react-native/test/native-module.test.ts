import type { InterfaceSignal } from '../src/native-module';

type NativeReport = InterfaceSignal & { sequence: number };
const snapshot: NativeReport = {
  interfaceChanged: false,
  identityChanged: false,
  isProviding: true,
  sessionId: '123',
  deviceId: 'device',
  timestamp: 100,
  sequence: 2,
};
const publicReport = ({ sequence: _sequence, ...signal }: NativeReport) => signal;

function createSubscription(platform = 'android', nativeSupport = true) {
  let resolve: (signal: NativeReport) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const initial = new Promise<NativeReport>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const nativeModule = {
    ...(nativeSupport
      ? { observeInterfaceSignals: jest.fn(() => initial), stopObservingInterfaceSignals: jest.fn() }
      : {}),
    ...(platform === 'ios' ? { addListener: jest.fn(), removeListeners: jest.fn() } : {}),
  };
  let emit: (signal: NativeReport) => void = () => undefined;
  const remove = jest.fn();
  const addListener = jest.fn((_name: string, callback: typeof emit) => {
    emit = callback;
    return { remove };
  });
  const emitter = jest.fn(() => ({ addListener }));
  const listener = jest.fn();
  let subscription: { remove(): void } = { remove: () => undefined };
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: platform, select: () => '' },
      TurboModuleRegistry: { get: () => nativeModule },
      NativeEventEmitter: emitter,
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const api = require('../src/native-module') as typeof import('../src/native-module');
    subscription = api.addInterfaceSignalListener(listener);
  });
  return {
    resolve,
    reject,
    emit: (signal: NativeReport) => emit(signal),
    listener,
    subscription,
    nativeModule,
    emitter,
    addListener,
    remove,
  };
}

describe('snapshot interface-signal subscriptions', () => {
  it.each(['android', 'ios'])('delivers initial and complete live state on %s', async (platform) => {
    const test = createSubscription(platform);
    expect(test.emitter.mock.calls).toEqual(platform === 'ios' ? [[test.nativeModule]] : [[]]);
    expect(test.addListener).toHaveBeenCalledWith('AMPNativeSessionReplayInterfaceSignal', expect.any(Function));
    expect(test.listener).not.toHaveBeenCalled();
    test.resolve(snapshot);
    await Promise.resolve();
    expect(test.listener).toHaveBeenCalledWith(publicReport(snapshot));
    const changed = { ...snapshot, sequence: 3, identityChanged: true, sessionId: '456', deviceId: null };
    test.emit(changed);
    expect(test.listener).toHaveBeenLastCalledWith(publicReport(changed));
    test.subscription.remove();
    test.subscription.remove();
    expect(test.remove).toHaveBeenCalledTimes(1);
    expect(test.nativeModule.stopObservingInterfaceSignals).toHaveBeenCalledTimes(1);
    test.emit({ ...snapshot, sequence: 4 });
    expect(test.listener).toHaveBeenCalledTimes(2);
  });

  it('orders buffered reports around the snapshot without duplicates or stale overwrites', async () => {
    const test = createSubscription();
    const ui = { ...snapshot, sequence: 1, interfaceChanged: true, timestamp: 99 };
    const stopped = { ...snapshot, sequence: 3, isProviding: false };
    test.emit(ui);
    test.emit(snapshot);
    test.emit(stopped);
    test.resolve(snapshot);
    await Promise.resolve();
    expect(test.listener.mock.calls).toEqual([ui, snapshot, stopped].map((signal) => [publicReport(signal)]));
    test.emit({ ...snapshot, sequence: 2 });
    expect(test.listener).toHaveBeenCalledTimes(3);
    test.subscription.remove();
  });

  it('does not deliver a pending snapshot after removal and releases its native observer', async () => {
    const test = createSubscription();
    test.subscription.remove();
    test.resolve(snapshot);
    await Promise.resolve();
    expect(test.listener).not.toHaveBeenCalled();
    expect(test.remove).toHaveBeenCalledTimes(1);
    expect(test.nativeModule.stopObservingInterfaceSignals).toHaveBeenCalledTimes(1);
  });

  it('cleans up a failed initialization without accepting later events', async () => {
    const test = createSubscription();
    test.reject(new Error('native initialization failed'));
    await Promise.resolve();
    test.emit(snapshot);
    test.subscription.remove();
    expect(test.listener).not.toHaveBeenCalled();
    expect(test.remove).toHaveBeenCalledTimes(1);
  });

  it('makes unsupported native binaries a no-op', () => {
    const test = createSubscription('android', false);
    test.subscription.remove();
    expect(test.emitter).not.toHaveBeenCalled();
    expect(test.listener).not.toHaveBeenCalled();
  });
});

describe('native module resolution', () => {
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
