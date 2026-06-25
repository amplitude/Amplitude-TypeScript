import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';
// The codegen types live in a Flow-typed file that eslint-plugin-import cannot parse.
// eslint-disable-next-line import/namespace
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

// Codegen TurboModule spec for the imperative Session Replay module.
//
// The config crosses the bridge as an untyped object: the native side already
// reads a ReadableMap / NSDictionary, and app-boundary type safety lives in the
// public `SessionReplayConfig`. See native-module.ts for the typed facade that
// JS callers actually use.
export interface Spec extends TurboModule {
  setup(config: UnsafeObject): Promise<void>;
  setSessionId(sessionId: number): Promise<void>;
  setDeviceId(deviceId: string | null): Promise<void>;
  getSessionId(): Promise<number>;
  getSessionReplayProperties(): Promise<UnsafeObject>;
  start(): Promise<void>;
  stop(): Promise<void>;
  flush(): Promise<void>;
}

// Use non-enforcing `get` (returns null when the native module isn't linked)
// so importing the package never crashes app startup. The typed facade in
// native-module.ts throws a friendly linking error lazily on first use instead.
// Works on both architectures: JSI on the New Architecture, legacy NativeModules
// fallback on the old one.
export default TurboModuleRegistry.get<Spec>('AMPNativeSessionReplay');
