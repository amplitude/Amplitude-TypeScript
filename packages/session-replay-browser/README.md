<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/session-replay-browser

Official Session Replay SDK

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/session-replay-browser

# yarn
yarn add @amplitude/session-replay-browser
```

## Usage

This SDK provides access to the Amplitude Session Replay product.

This plugin requires that default tracking for sessions is enabled. If default tracking for sessions is not enabled in the config, the plugin will automatically enable it.

### 1. Import Amplitude packages

* `@amplitude/session-replay-browser`

```typescript
import * as sessionReplay from '@amplitude/session-replay-browser';
```

### 2. Initialize session replay collection

The SDK must be configured via the following code. This call kicks off collection of replays for the user.

```typescript
sessionReplay.init(API_KEY, {
  deviceId: DEVICE_ID,
  sessionId: SESSION_ID,
  sampleRate: 0.5,
});
```

### 3. Get session replay event properties
Any event that occurs within the span of a session replay must be tagged with properties that signal to Amplitude to include it in the scope of the replay. The following shows an example of how to use the properties
```typescript
const sessionRecordingProperties = sessionReplay.getSessionRecordingProperties();
track(EVENT_NAME, {
  ...eventProperties,
  ...sessionRecordingProperties
})
```

### 4. Update session id
Any time that the session id for the user changes, the session replay SDK must be notified of that change. Update the session id via the following method:
```typescript
sessionReplay.setSessionId(UNIX_TIMESTAMP)
```

### 5. Shutdown (optional)
If at any point you would like to discontinue collection of session replays, for example in a part of your application where you would not like sessions to be collected, you can use the following method to stop collection and remove collection event listeners.
```typescript
sessionReplay.shutdown()
```

#### Options

|Name|Type|Required|Default|Description|
|-|-|-|-|-|
|`deviceId`|`string`|Yes|`undefined`|Sets an identifier for the device running your application.|
|`sessionId`|`number`|Yes|`undefined`|Sets an identifier for the users current session. The value must be in milliseconds since epoch (Unix Timestamp).|
|`sampleRate`|`number`|No|`undefined`|Use this option to control how many sessions will be selected for replay collection. A selected session will be collected for replay, while sessions that are not selected will not.  <br></br>The number should be a decimal between 0 and 1, ie `0.4`, representing the fraction of sessions you would like to have randomly selected for replay collection. Over a large number of sessions, `0.4` would select `40%` of those sessions.|
|`optOut`|`boolean`|No|`false`|Sets permission to collect replays for sessions. Setting a value of true prevents Amplitude from collecting session replays.|
|`flushMaxRetries`|`number`|No|`5`|Sets the maximum number of retries for failed upload attempts. This is only applicable to retryable errors.|
|`logLevel`|`number`|No|`LogLevel.Warn`|`LogLevel.None` or `LogLevel.Error` or `LogLevel.Warn` or `LogLevel.Verbose` or `LogLevel.Debug`. Sets the log level.|
|`loggerProvider`|`Logger`|No|`Logger`|Sets a custom loggerProvider class from the Logger to emit log messages to desired destination.|
|`serverZone`|`string`|No|`US`|EU or US. Sets the Amplitude server zone. Set this to EU for Amplitude projects created in EU data center.|

## Privacy
By default, the session replay will mask all inputs, meaning the text in inputs will appear in a session replay as asterisks: `***`. You may require more specific masking controls based on your use case, so we offer the following controls:

#### 1. Unmask inputs
In your application code, add the class `.amp-unmask` to any __input__ whose text you'd like to have unmasked in the replay. In the session replay, it will be possible to read the exact text entered into an input with this class, the text will not be converted to asterisks.

#### 2. Mask non-input elements
In your application code, add the class `.amp-mask` to any __non-input element__ whose text you'd like to have masked from the replay. The text in the element, as well as it's children, will all be converted to asterisks.

#### 3. Block non-text elements
In your application code, add the class `.amp-block` to any element you would like to have blocked from the collection of the replay. The element will appear in the replay as a placeholder with the same dimensions.
