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

### 3. Evaluate targeting (optional)
Any event that occurs within the span of a session replay must be passed to the SDK to evaluate against targeting conditions. This should be done *before* step 4, getting the event properties. If you are not using the targeting condition logic provided via the Amplitude UI, this step is not required.
```typescript
const sessionTargetingMatch = sessionReplay.evaluateTargetingAndCapture({ event: {
  event_type: EVENT_NAME,
  time: EVENT_TIMESTAMP,
  event_properties: eventProperties
} });
```

### 4. Get session replay event properties
Any event that occurs within the span of a session replay must be tagged with properties that signal to Amplitude to include it in the scope of the replay. The following shows an example of how to use the properties
```typescript
const sessionReplayProperties = sessionReplay.getSessionReplayProperties();
track(EVENT_NAME, {
  ...eventProperties,
  ...sessionReplayProperties
})
```

### 5. Update session id
Any time that the session id for the user changes, the session replay SDK must be notified of that change. Update the session id via the following method:
```typescript
sessionReplay.setSessionId(UNIX_TIMESTAMP)
```
You can optionally pass a new device id as a second argument as well:
```typescript
sessionReplay.setSessionId(UNIX_TIMESTAMP, deviceId)
```

### 6. Shutdown (optional)
If at any point you would like to discontinue collection of session replays, for example in a part of your application where you would not like sessions to be collected, you can use the following method to stop collection and remove collection event listeners.
```typescript
sessionReplay.shutdown()
```

#### Options

|Name|Type|Required|Default|Description|
|-|-|-|-|-|
|`deviceId`|`string`|Yes|`undefined`|Sets an identifier for the device running your application.|
|`sessionId`|`number`|Yes|`undefined`|Sets an identifier for the users current session. The value must be in milliseconds since epoch (Unix Timestamp).|
|`sampleRate`|`number`|No|`0`|Use this option to control how many sessions will be selected for replay collection. A selected session will be collected for replay, while sessions that are not selected will not.  <br></br>The number should be a decimal between 0 and 1, ie `0.01`, representing the fraction of sessions you would like to have randomly selected for replay collection. Over a large number of sessions, `0.01` would select `1%` of those sessions.|
|`optOut`|`boolean`|No|`false`|Sets permission to collect replays for sessions. Setting a value of true prevents Amplitude from collecting session replays.|
|`flushMaxRetries`|`number`|No|`2`|Sets the maximum number of retries for failed upload attempts. This is only applicable to retryable errors.|
|`logLevel`|`number`|No|`LogLevel.Warn`|`LogLevel.None` or `LogLevel.Error` or `LogLevel.Warn` or `LogLevel.Verbose` or `LogLevel.Debug`. Sets the log level.|
|`loggerProvider`|`Logger`|No|`Logger`|Sets a custom loggerProvider class from the Logger to emit log messages to desired destination.|
|`serverZone`|`string`|No|`US`|EU or US. Sets the Amplitude server zone. Set this to EU for Amplitude projects created in EU data center.|
|`privacyConfig`|`object`|No|`undefined`|Supports advanced masking configs with CSS selectors.|
|`debugMode`|`boolean`|No|`false`|Adds additional debug event property to help debug instrumentation issues (such as mismatching apps). Only recommended for debugging initial setup, and not recommended for production.|
|`configServerUrl`|`string`|No|`undefined`|Specifies the endpoint URL to fetch remote configuration. If provided, it overrides the default server zone configuration.|
|`trackServerUrl`|`string`|No|`undefined`|Specifies the endpoint URL for sending session replay data. If provided, it overrides the default server zone configuration.|
|`shouldInlineStylesheet`|`boolean`|No|`true`|If stylesheets are inlined, the contents of the stylesheet will be stored. During replay, the stored stylesheet will be used instead of attempting to fetch it remotely. This prevents replays from appearing broken due to missing stylesheets. Note: Inlining stylesheets may not work in all cases. If this is `undefined` stylesheets will be inlined.|
|`storeType`|`string`|No|`idb`|Specifies how replay events should be stored. `idb` uses IndexedDB to persist replay events when all events cannot be sent during capture. `memory` stores replay events only in memory, meaning events are lost when the page is closed. If IndexedDB is unavailable, the system falls back to `memory`.|
|`performanceConfig.enabled`|`boolean`|No|`true`|If enabled, event compression will be deferred to occur during the browser's idle periods.|
|`performanceConfig.timeout`|`number`|No|`undefined`|Optional timeout in milliseconds for the `requestIdleCallback` API. If specified, this value will be used to set a maximum time for the browser to wait before executing the deferred compression task, even if the browser is not idle.|
|`useWebWorker`|`boolean`|No|`false`|If true, the SDK will compress replay events using a web worker. This offloads compression to a separate thread, improving performance on the main thread.|

## Bundle Size Optimization
The Session Replay SDK uses dynamic imports to optimize bundle size and improve initial page load performance. Key modules are loaded on-demand rather than being included in the initial bundle:

- **`@amplitude/rrweb-record`**: The core recording functionality is dynamically imported when `sessionReplay.init()` is called and capture should begin. In cases where users are not sampled or have opted out, then the Session Replay SDK will not import these dependencies. 

This approach ensures that:
- Your application's initial JavaScript bundle remains as small as possible.
- Only the necessary Session Replay dependencies are loaded.

The dynamic imports happen asynchronously and won't block your application's initialization. If the imports fail for any reason, the SDK will not initiate capture.

## Privacy
By default, the session replay will mask all inputs, meaning the text in inputs will appear in a session replay as asterisks: `***`. You may require more specific masking controls based on your use case, so we offer the following controls:

#### 1. Unmask inputs
In your application code, add the class `.amp-unmask` to any __input__ whose text you'd like to have unmasked in the replay. In the session replay, it will be possible to read the exact text entered into an input with this class, the text will not be converted to asterisks.

#### 2. Mask non-input elements
In your application code, add the class `.amp-mask` to any __non-input element__ whose text you'd like to have masked from the replay. The text in the element, as well as it's children, will all be converted to asterisks.

#### 3. Block non-text elements
In your application code, add the class `.amp-block` to any element you would like to have blocked from the collection of the replay. The element will appear in the replay as a placeholder with the same dimensions.

#### 4. Block elements by CSS selectors. 
In the SDK initialization code, you can configure the SDK to block elements based on CSS selectors.
```typescript
sessionReplay.init(AMPLITUDE_API_KEY, {
  sampleRate: 0.01, 
  privacyConfig: {
      blockSelector: ['.ignoreClass', '#ignoreId']
  }
})
```

