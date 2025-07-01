<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-session-replay-browser

Official Browser SDK plugin for session replay

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-session-replay-browser

# yarn
yarn add @amplitude/plugin-session-replay-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds session replay features to built-in features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.9.1` or later.

This plugin requires that default tracking for sessions is enabled. If default tracking for sessions is not enabled in the config, the plugin will automatically enable it.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-session-replay-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
```

### 2. Instantiate Session Replay plugin

The plugin must be registered with the amplitude instance via the following code. The plugin accepts an optional parameter which is an `Object` to configure the plugin based on your use case.

```typescript
amplitude.init(API_KEY);
const sessionReplayTracking = sessionReplayPlugin({
  sampleRate: undefined
});
```


#### Options

|Name|Type|Default|Required|Description|
|-|-|-|-|-|
|`sampleRate`|`number`|`undefined`|Yes|Use this option to control how many sessions will be selected for replay collection. A selected session will be collected for replay, while sessions that are not selected will not.  <br></br>The number should be a decimal between 0 and 1, ie `0.01`, representing the fraction of sessions you would like to have randomly selected for replay collection. Over a large number of sessions, `0.01` would select `1%` of those sessions.|
|`privacyConfig`|`object`|`undefined`|No| Supports advanced masking configs with CSS selectors.|
|`forceSessionTracking`|`boolean`|`false`|No|If this is enabled we will force the browser SDK to also send start and end session events.|
|`debugMode`|`boolean`|`false`|No| Adds additional debug event property to help debug instrumentation issues (such as mismatching apps). Only recommended for debugging initial setup, and not recommended for production.|
|`configServerUrl`|`string`|No|`undefined`|Specifies the endpoint URL to fetch remote configuration. If provided, it overrides the default server zone configuration.|
|`trackServerUrl`|`string`|No|`undefined`|Specifies the endpoint URL for sending session replay data. If provided, it overrides the default server zone configuration.|
|`shouldInlineStylesheet`|`boolean`|No|`true`|If stylesheets are inlined, the contents of the stylesheet will be stored. During replay, the stored stylesheet will be used instead of attempting to fetch it remotely. This prevents replays from appearing broken due to missing stylesheets. Note: Inlining stylesheets may not work in all cases. If this is `undefined` stylesheets will be inlined.|
|`storeType`|`string`|No|`idb`|Specifies how replay events should be stored. `idb` uses IndexedDB to persist replay events when all events cannot be sent during capture. `memory` stores replay events only in memory, meaning events are lost when the page is closed. If IndexedDB is unavailable, the system falls back to `memory`.|
|`performanceConfig.enabled`|`boolean`|No|`true`|If enabled, event compression will be deferred to occur during the browser's idle periods.|
|`performanceConfig.timeout`|`number`|No|`undefined`|Optional timeout in milliseconds for the `requestIdleCallback` API. If specified, this value will be used to set a maximum time for the browser to wait before executing the deferred compression task, even if the browser is not idle.|
|`experimental.useWebWorker`|`boolean`|No|`false`|If the SDK should compress the replay events using a webworker.|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(sessionReplayTracking);
```

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
const sessionReplayTracking = sessionReplayPlugin({
  sampleRate: 0.01,
  privacyConfig: {
      blockSelector: ['.ignoreClass', '#ignoreId']
  }
});
```

## Debugging 

### Using debugMode when developing locally
Since the Session Replay plugin only records and tags events when the page is in focus, this can sometimes be problematic when developing locally with the browser console open. If you are having issues with the replays not showing up (while your quota usage going up). Try turning setting `debugMode:true` to see if that helps with the issue.
