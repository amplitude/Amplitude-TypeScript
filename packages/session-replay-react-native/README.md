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

To attach Session Replay to the Amplitude React Native SDK, use [`@amplitude/plugin-session-replay-react-native`](https://www.npmjs.com/package/@amplitude/plugin-session-replay-react-native) instead of importing a plugin from this package.

## Masking views

To mask certain views, add the `AmpMaskView` tag with the mask property `amp-mask` around the section to be masked

`<AmpMaskView>` lays out exactly like a plain `<View>` and works on both React Native architectures: on the New Architecture it is a native Fabric component, on the old architecture it uses the classic view managers.

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
