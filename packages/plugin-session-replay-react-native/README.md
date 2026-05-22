# @amplitude/plugin-session-replay-react-native

Amplitude Session Replay plugin for React Native

## Installation

```sh
npm install @amplitude/plugin-session-replay-react-native
```

## Usage
Add the session replay plugin to your Amplitude instance as follows

```js
import { SessionReplayPlugin, MaskLevel } from '@amplitude/plugin-session-replay-react-native';

// ...

const config: SessionReplayConfig = {
    enableRemoteConfig: true, // default true
    sampleRate: 1, // default 0
    logLevel: LogLevel.Warn, // default LogLevel.Warn
    maskLevel: MaskLevel.Medium, // default MaskLevel.Medium
};
await init('YOUR_API_KEY').promise;
await add(new SessionReplayPlugin(config)).promise;

```

## Mask levels

Control how aggressively Session Replay masks sensitive content via the `maskLevel` config option:

| Value | What gets masked |
|---|---|
| `MaskLevel.Light` | Password and phone-number `<TextInput>` fields only |
| `MaskLevel.Medium` (default) | All `<TextInput>` fields |
| `MaskLevel.Conservative` | All `<TextInput>` fields **and** all `<Text>` elements |

```js
import { SessionReplayPlugin, MaskLevel } from '@amplitude/plugin-session-replay-react-native';

const config: SessionReplayConfig = {
    maskLevel: MaskLevel.Conservative, // mask all text and inputs
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