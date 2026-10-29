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

/** Subscribe to the native SDK's interface change and recording lifecycle events. */
export function addInterfaceSignalListener(listener: (signal: InterfaceSignal) => void): EmitterSubscription {
  return new NativeEventEmitter(PluginSessionReplayReactNative).addListener(
    'PluginSessionReplayReactNativeInterfaceSignal',
    listener,
  );
}
