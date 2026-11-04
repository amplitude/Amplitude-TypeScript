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
matches the Session ID on your analytics events:

```js
import { init, SessionReplayConfig } from '@amplitude/session-replay-react-native';

const config: SessionReplayConfig = {
  apiKey: 'YOUR_API_KEY',
  deviceId: 'YOUR_DEVICE_ID',
  sessionId: Date.now(),
};

await init(config);
```

Session Replay does not capture anything until a valid session id is set — a
positive number or a non-empty string. Until then the SDK stays configured but
idle, even after `start()`.

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


## Interface signals

`addInterfaceSignalListener(listener)` returns a subscription with `remove()`.
It first delivers a snapshot, followed by reports containing the full current state:

```typescript
{
  interfaceChanged: false,
  identityChanged: false,
  isProviding: true,
  sessionId: '123',
  deviceId: 'device',
  timestamp: 1767225600000,
}
```

The snapshot establishes current state without inventing a UI change. Subscribe
before processing presses, and wait for that first report. Unsupported or unlinked
native binaries produce no reports; detection stays unavailable.

`interfaceChanged` indicates an observed UI change. `identityChanged` indicates an
actual session/device change. Every report includes recording availability and
identity, so consumers do not need a separate state query. Process both change
flags independently, and invalidate pending observations when availability is
false or identity changes. Remove the subscription when finished.

Queued reports and the initial snapshot are delivered in native order. Removing a
subscription cancels its pending snapshot and releases the native observer.
Android checks SDK availability every 100 ms while subscribers exist, in addition
to lifecycle and UI reports, because the SDK has no availability callback. iOS
forwards native callbacks and ignores queued callbacks from detached recorders.
