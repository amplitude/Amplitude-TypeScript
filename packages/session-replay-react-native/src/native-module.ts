import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@amplitude/session-replay-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

export const NativeSessionReplay = NativeModules.NativeSessionReplay
  ? (NativeModules.NativeSessionReplay as NativeSessionReplaySpec)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    ) as NativeSessionReplaySpec);

export const PluginSessionReplayReactNative = NativeSessionReplay;

export interface NativeSessionReplayConfig {
  apiKey: string;
  autoStart: boolean;
  deviceId: string | null;
  enableRemoteConfig: boolean;
  //'None' | 'Error' | 'Warn' | 'Verbose' | 'Debug';
  logLevel: 0 | 1 | 2 | 3 | 4;
  maskLevel: 'light' | 'medium' | 'conservative';
  optOut: boolean;
  sampleRate: number;
  serverZone: 'US' | 'EU';
  sessionId: number;
}

export interface NativeSessionReplayProperties {
  [key: string]: string | number | boolean;
}

export interface NativeSessionReplaySpec {
  flush(): Promise<void>;
  // OLD ARCH: ideally we want to cash that on JS side to avoid bridge overhead
  getSessionId(): Promise<number>;
  getSessionReplayProperties(): Promise<NativeSessionReplayProperties>;

  // OLD ARCH: combine those into one method to avoid bridge overhead
  setDeviceId(deviceId: string | null): Promise<void>;
  setSessionId(sessionId: number): Promise<void>;
  setup(config: NativeSessionReplayConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
