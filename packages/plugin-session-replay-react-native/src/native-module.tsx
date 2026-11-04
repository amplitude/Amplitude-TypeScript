import { NativeEventEmitter, NativeModules, Platform, type EmitterSubscription, type NativeModule } from 'react-native';

const LINKING_ERROR =
  `The package '@amplitude/plugin-session-replay-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

interface PluginSessionReplayNativeModule extends NativeModule {
  setup(
    apiKey: string,
    deviceId: string | undefined,
    sessionId: number | undefined,
    serverZone: string | undefined,
    sampleRate: number,
    enableRemoteConfig: boolean,
    logLevel: number,
    autoStart: boolean,
    maskLevel: string,
  ): Promise<void>;
  getSessionId(): Promise<number>;
  setSessionId(sessionId: number): Promise<void>;
  getSessionReplayProperties(): Promise<Record<string, string | number | boolean>>;
  observeInterfaceSignals(): Promise<NativeInterfaceSignal>;
  stopObservingInterfaceSignals(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  flush(): Promise<void>;
  teardown(): Promise<void>;
}

const nativeModule = NativeModules.PluginSessionReplayReactNative as PluginSessionReplayNativeModule | undefined;

export const PluginSessionReplayReactNative = (nativeModule ??
  new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    },
  )) as PluginSessionReplayNativeModule;

/** Current recording state included with every observation report. */
export interface InterfaceSignalState {
  isProviding: boolean;
  sessionId: string;
  deviceId: string | null;
}

/** The first report is a snapshot; subsequent reports also describe what changed. */
export interface InterfaceSignal extends InterfaceSignalState {
  interfaceChanged: boolean;
  identityChanged: boolean;
  timestamp: number;
}

// Native sequence numbers order the initial snapshot relative to queued events.
interface NativeInterfaceSignal extends InterfaceSignal {
  sequence: number;
}

/** Subscribe to an initial snapshot followed by complete state updates. */
export function addInterfaceSignalListener(
  listener: (signal: InterfaceSignal) => void,
): Pick<EmitterSubscription, 'remove'> {
  if (
    typeof nativeModule?.observeInterfaceSignals !== 'function' ||
    typeof nativeModule?.stopObservingInterfaceSignals !== 'function' ||
    (Platform.OS !== 'android' &&
      (typeof nativeModule?.addListener !== 'function' || typeof nativeModule?.removeListeners !== 'function'))
  ) {
    return { remove: () => undefined };
  }
  const emitter =
    Platform.OS === 'android'
      ? new NativeEventEmitter()
      : new NativeEventEmitter(PluginSessionReplayReactNative as unknown as NativeModule);
  let removed = false;
  let initialized = false;
  let sequence = -1;
  const pending: NativeInterfaceSignal[] = [];
  const deliver = (signal: NativeInterfaceSignal) => {
    if (removed || signal.sequence <= sequence) return;
    sequence = signal.sequence;
    const { sequence: _sequence, ...report } = signal;
    listener(report);
  };
  const subscription = emitter.addListener(
    'PluginSessionReplayReactNativeInterfaceSignal',
    (signal: NativeInterfaceSignal) => {
      if (removed) return;
      if (initialized) deliver(signal);
      else pending.push(signal);
    },
  );
  // Install the JS listener first. Buffer native events until the subscription's
  // initial snapshot arrives, then deliver them in native order without duplicates.
  void PluginSessionReplayReactNative.observeInterfaceSignals().then(
    (snapshot) => {
      if (removed) {
        PluginSessionReplayReactNative.stopObservingInterfaceSignals();
        return;
      }
      pending.push(snapshot);
      pending.sort((left, right) => left.sequence - right.sequence);
      initialized = true;
      pending.forEach(deliver);
      pending.length = 0;
    },
    () => {
      removed = true;
      pending.length = 0;
      subscription.remove();
    },
  );
  return {
    remove: () => {
      if (removed) return;
      removed = true;
      pending.length = 0;
      subscription.remove();
      if (initialized) PluginSessionReplayReactNative.stopObservingInterfaceSignals();
    },
  };
}
