import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@amplitude/plugin-session-replay-react-native' doesn't seem to be linked. Make sure: \n\n` +
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
