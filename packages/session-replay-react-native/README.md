# @amplitude/session-replay-react-native

Amplitude Session Replay for React Native

## Installation

```sh
npm install @amplitude/session-replay-react-native
```

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
