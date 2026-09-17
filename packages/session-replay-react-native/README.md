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

Initialize the SDK with your Amplitude API key and the session identifier that
matches the Session ID on your analytics events. Use `customSessionId` for the
session id — it accepts any alphanumeric value (for example a UUID):

```js
import { init, SessionReplayConfig } from '@amplitude/session-replay-react-native';

const config: SessionReplayConfig = {
  apiKey: 'YOUR_API_KEY',
  deviceId: 'YOUR_DEVICE_ID',
  customSessionId: '550e8400-e29b-41d4-a716-446655440000',
};

await init(config);
```

Read or rotate the custom session id at runtime:

```js
import { init, setCustomSessionId, getCustomSessionId } from '@amplitude/session-replay-react-native';

await init({
  apiKey: 'YOUR_API_KEY',
  deviceId: 'YOUR_DEVICE_ID',
  customSessionId: '550e8400-e29b-41d4-a716-446655440000',
});

await setCustomSessionId('next-session-uuid');
const customId = await getCustomSessionId(); // 'next-session-uuid'
```

#### Numeric `sessionId`

The numeric `sessionId` API is still supported for parity with Amplitude
Analytics' numeric sessions. Under the hood it is mapped onto the custom session
id (as its string form) — the SDK drives session identity exclusively through
the custom session id path. `getSessionId()` still returns the numeric value you
passed, while `getCustomSessionId()` returns the string it was mapped to. While
a string custom session id is active, `getSessionId()` returns `-1`.

```js
import { init, setSessionId, getSessionId, getCustomSessionId } from '@amplitude/session-replay-react-native';

await init({ apiKey: 'YOUR_API_KEY', deviceId: 'YOUR_DEVICE_ID', sessionId: Date.now() });

await setSessionId(1717171717171);
await getSessionId(); // 1717171717171
await getCustomSessionId(); // '1717171717171'
```

To use Amplitude Session Replay with Amplitude Analytics, use the [`@amplitude/plugin-session-replay-react-native`](https://www.npmjs.com/package/@amplitude/plugin-session-replay-react-native) plugin package.

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
