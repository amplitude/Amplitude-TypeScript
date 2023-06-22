<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-session-replay

Official Browser SDK plugin for session replay

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-session-replay

# yarn
yarn add @amplitude/plugin-session-replay
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds session replay features to built-in features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v2.0.0` or later.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-session-replay`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay';
```

### 2. Instantiate session replay plugin and install plugin to Amplitude SDK

The plugin must be registered with the amplitude instance via the following code:

```typescript
amplitude.init(API_KEY)
const sessionReplayTracking = new SessionReplayPlugin();
amplitude.add(sessionReplayTracking)
```