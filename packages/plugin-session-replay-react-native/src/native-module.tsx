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
  getInterfaceSignalState(): Promise<InterfaceSignalState>;
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
  interfaceChanged: boolean;
  identityChanged: boolean;
  isProviding: boolean;
  timestamp: number;
}

/** Current native recording availability and identity for interface-signal consumers. */
export interface InterfaceSignalState {
  isProviding: boolean;
  sessionId: string;
  deviceId: string | null;
}

function supportsInterfaceSignals(): boolean {
  return (
    typeof nativeModule?.getInterfaceSignalState === 'function' &&
    (Platform.OS === 'android' ||
      (typeof nativeModule?.addListener === 'function' && typeof nativeModule?.removeListeners === 'function'))
  );
}

/** Returns null when the linked native binary cannot provide interface signals. */
export async function getInterfaceSignalState(): Promise<InterfaceSignalState | null> {
  return supportsInterfaceSignals() ? PluginSessionReplayReactNative.getInterfaceSignalState() : null;
}

/** Subscribe to UI changes, recording availability transitions, and recording identity changes. */
export function addInterfaceSignalListener(
  listener: (signal: InterfaceSignal) => void,
): Pick<EmitterSubscription, 'remove'> {
  if (!supportsInterfaceSignals()) {
    return { remove: () => undefined };
  }
  // Android events arrive on the shared device event emitter, so the emitter is
  // constructed without a module. iOS passes the module so RCTEventEmitter can
  // start and stop observation.
  const emitter =
    Platform.OS === 'android' ? new NativeEventEmitter() : new NativeEventEmitter(PluginSessionReplayReactNative);
  const subscription = emitter.addListener('PluginSessionReplayReactNativeInterfaceSignal', listener);
  return subscription;
}
