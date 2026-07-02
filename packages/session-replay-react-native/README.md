# @amplitude/session-replay-react-native

Amplitude Session Replay for React Native

## Installation

```sh
npm install @amplitude/session-replay-react-native
```

## React Native New Architecture

This SDK supports both the New Architecture (Bridgeless / TurboModules) and the
legacy architecture. On the New Architecture the native module is exposed as a
TurboModule; on the legacy architecture it continues to work as a standard bridge
module. No configuration is required — the correct implementation is selected
automatically based on how your app is built.

`peerDependencies` are intentionally left unconstrained (`react-native: "*"`) so
the SDK keeps working on older React Native versions on the legacy architecture.
The TurboModule code path is compiled only when the New Architecture is enabled,
which itself requires React Native 0.74 or newer.

### Fabric foundation (internal)

This release includes internal groundwork for an upcoming layout-transparent
masking component built on Fabric. The component is currently inert: it is not
part of the public API, exposes nothing new to call, and does not change any
masking behavior.

The Fabric/C++ sources compile only on the New Architecture with React Native
0.77 or newer (they rely on capabilities that exist only in those versions).
On the legacy architecture, or on the New Architecture with React Native older
than 0.77, the Fabric sources are excluded. Enabling the New Architecture on
React Native older than 0.77 fails the build fast with a clear error (an
"RN-floor gate" enforced in both `android/build.gradle` and the iOS podspec).

## Usage

### Session Replay React Native Standalone SDK

Initialize SDK with your amplidude API Key
```js
import { init, SessionReplayConfig } from '@amplitude/session-replay-react-native';

const config: SessionReplayConfig = { 
    apiKey: 'YOUR_API_KEY',
    deviceId: 'YOUR_DEVICE_ID',
    sessionId: Date.now()
}

await init(config);
```

### Session Replay React Native Plugin

Add the session replay plugin to your Amplitude instance as follows

```js
import { SessionReplayPlugin, SessionReplaPluginConfig } from '@amplitude/session-replay-react-native';

// ...

const config: SessionReplaPluginConfig = {
  enableRemoteConfig: true, // default true
  sampleRate: 1, // default 0
  logLevel: LogLevel.Warn, // default LogLevel.Warn
};
await init('YOUR_API_KEY').promise;
await add(new SessionReplayPlugin(config)).promise;
```

## Masking views

To maks certain views, add the `AmpMaskView` tag with the mask property `amp-mask` around the section to be masked

```js
import { AmpMaskView } from '@amplitude/session-replay-react-native';

// ...

<AmpMaskView mask="amp-mask">
  <Text
    style={[
      styles.sectionTitle,
      {
        color: isDarkMode ? Colors.white : Colors.black,
      },
    ]}
  >
    {title}
  </Text>
</AmpMaskView>;
```

## Unmasking views

To unmask views, add the `AmpMaskView` tag with the mask property `amp-unmask` around the section to be unmasked

```js
import { AmpMaskView } from '@amplitude/session-replay-react-native';

// ...

<AmpMaskView mask="amp-unmask">
  <Text
    style={[
      styles.sectionTitle,
      {
        color: isDarkMode ? Colors.white : Colors.black,
      },
    ]}
  >
    {title}
  </Text>
</AmpMaskView>;
```

## Tracking Web Views (Beta)

Web views are blocked by default and will not be tracked. If you'd like webviews to be tracked, you can manually unmask
them by doing the following

```js
<AmpMaskView mask="amp-unmask" style={{ flex: 1 }}>
  <WebView source={{ uri: 'https://reactnative.dev/' }} style={{ flex: 1 }} />
</AmpMaskView>
```
