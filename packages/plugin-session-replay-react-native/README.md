# @amplitude/plugin-session-replay-react-native

Amplitude Session Replay plugin for React Native

## Installation

```sh
npm install @amplitude/plugin-session-replay-react-native
```

## Usage
Add the session replay plugin to your Amplitude instance as follows

```js
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';

// ...

const config: SessionReplayConfig = {
    enableRemoteConfig: true, // default true
    sampleRate: 1, // default 0
    logLevel: LogLevel.Warn, // default LogLevel.Warn
    privacyConfig: { maskLevel: 'medium' }, // 'medium' is the default
};
await init('YOUR_API_KEY').promise;
await add(new SessionReplayPlugin(config)).promise;

```

## Mask levels

Control how aggressively Session Replay masks sensitive content via the `privacyConfig.maskLevel` config option:

| Value | What gets masked |
|---|---|
| `'light'` | Password and phone-number `<TextInput>` fields only |
| `'medium'` (default) | All `<TextInput>` fields |
| `'conservative'` | All `<TextInput>` fields **and** all `<Text>` elements |

```js
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';

const config: SessionReplayConfig = {
    privacyConfig: { maskLevel: 'conservative' }, // mask all text and inputs
};
```

> **Note:** Third-party text renderers that bypass UIKit/Android's standard text views (for example `react-native-svg`, `@shopify/react-native-skia`) are not detected by automatic masking. Wrap such content in `<AmpMaskView mask="amp-mask">` to mask it manually.

## Masking views
To mask certain views, add the `AmpMaskView` tag with the mask property `amp-mask` around the section to be masked

```js
import { AmpMaskView } from '@amplitude/plugin-session-replay-react-native';

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
</AmpMaskView>
```

## Unmasking views
To unmask views, add the `AmpMaskView` tag with the mask property `amp-unmask` around the section to be unmasked

```js
import { AmpMaskView } from '@amplitude/plugin-session-replay-react-native';

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
</AmpMaskView>
```

## Tracking Web Views (Beta)
Web views are blocked by default and will not be tracked. If you'd like webviews to be tracked, you can manually unmask them by doing the following

```js
<AmpMaskView mask="amp-unmask" style={{ flex: 1 }}>
    <WebView source={{ uri: 'https://reactnative.dev/' }} style={{ flex: 1 }} />
</AmpMaskView>
```

## Interface signals

`addInterfaceSignalListener(listener)` returns a subscription with `remove()` and
forwards these native events:

- `interfaceChanged`: the native recorder observed a UI change.
- `startProviding`: the recording provider became available.
- `stopProviding`: the recording provider became unavailable or was replaced.
- `identityChanged`: the recording session or device ID actually changed.

No event is synthesized when a listener subscribes. No-op setters do not emit
identity events. Dead-click consumers invalidate pending observations on
`stopProviding` and `identityChanged`; `startProviding` alone does not invalidate
an observation. Recording availability and identity are checked at both ends of
each click window.

`getInterfaceSignalState()` reads current `isProviding`, `sessionId`, and
`deviceId`. It resolves to `null` if the native module is unlinked or lacks
interface-signal support; subscriptions are then no-ops. Native query failures
reject the promise so consumers can skip detection for that observation window.

On Android, the bridge reports availability transitions when lifecycle methods,
state queries, or UI callbacks observe them; the native SDK has no dedicated
availability callback. On iOS, native start/stop-providing callbacks are forwarded,
with an explicit stop notification before an active recorder is detached.
