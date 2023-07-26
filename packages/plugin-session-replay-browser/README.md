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

This plugin works on top of Amplitude Browser SDK and adds session replay features to built-in features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.0.0` or later.

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

|Name|Type|Default|Description|
|-|-|-|-|
|`sampleRate`|`number`|`undefined`|Use this option to control how many sessions will be selected for recording. A selected session will be recorded, while sessions that are not selected will not be recorded.  <br></br>The number should be a decimal between 0 and 1, ie `0.4`, representing the fraction of sessions you would like to have randomly selected for recording. Over a large number of sessions, `0.4` would select `40%` of those sessions.|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(sessionReplayTracking);
```