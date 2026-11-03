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
  getDeviceId?(): Promise<string | null>;
  setDeviceId?(deviceId: string | null): Promise<void>;
  setSessionId(sessionId: number): Promise<void>;
  getSessionReplayProperties(): Promise<Record<string, string | number | boolean>>;
  getInterfaceSignalState(): Promise<{ isProviding: boolean; sessionId: string; deviceId: string | null }>;
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

/** Native UI observation events. Lifecycle bookkeeping belongs to the JS consumer. */
export interface InterfaceSignal {
  type: 'interfaceChanged' | 'stateChanged';
  timestamp: number;
}

/** Subscribe to native interface changes, immediately notifying the listener to read current state. */
export function addInterfaceSignalListener(listener: (signal: InterfaceSignal) => void): EmitterSubscription {
  // Android events arrive on the shared device event emitter, so the emitter is
  // constructed without a module. iOS passes the module so RCTEventEmitter can
  // start and stop observation.
  const emitter =
    Platform.OS === 'android' ? new NativeEventEmitter() : new NativeEventEmitter(PluginSessionReplayReactNative);
  const subscription = emitter.addListener('PluginSessionReplayReactNativeInterfaceSignal', listener);
  // Prompt each subscriber to read current state, even when native state has
  // not changed since it started listening.
  listener({ type: 'stateChanged', timestamp: Date.now() });
  return subscription;
}
