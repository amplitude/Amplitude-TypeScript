import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@amplitude/session-replay-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

export const PluginSessionReplayReactNative =
  NativeModules.PluginSessionReplayReactNative
    ? NativeModules.PluginSessionReplayReactNative
    : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export const NativeSessionReplay: NativeSessionReplay = {
  getSessionId: function (): Promise<number>  {
    throw new Error('Function not implemented.');
  },
  getSessionReplayProperties: function (): Promise<NativeSessionReplayProperties> {
    throw new Error('Function not implemented.');
  },
  setSessionId: function (sessionId: number): Promise<void> {
    throw new Error('Function not implemented.');
  },
  setup: function (config: NativeSessionReplayConfig): Promise<void> {
    throw new Error('Function not implemented.');
  },
  start: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  stop: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  teardown: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  flush: function (): Promise<void> {
    throw new Error('Function not implemented.');
  }
}

export interface NativeSessionReplayConfig {
  apiKey: string;
  autoStart: boolean;
  deviceId: string;
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

export interface NativeSessionReplay {
  flush(): Promise<void>;
  getSessionId(): Promise<number>;
  getSessionReplayProperties(): Promise<NativeSessionReplayProperties>;
  setSessionId(sessionId: number): Promise<void>;
  setup(config: NativeSessionReplayConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  teardown(): Promise<void>;
}
