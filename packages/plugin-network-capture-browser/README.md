<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-network-capture-browser (beta)
**This plugin is in beta at the moment, naming and interface might change in the future.**

## TODO: Re-write this README.md to match plugin-network-capture

Browser SDK plugin for network capture.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-network-capture-browser@beta

# yarn
yarn add @amplitude/plugin-network-capture-browser@beta
```

## Usage

This plugin works on top of the Amplitude Browser SDK, and tracks network request events

To use this plugin, you need to install `@amplitude/plugin-network-capture-browser`

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-network-capture-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { networkCapturePlugin } from '@amplitude/plugin-network-capture-browser';
```

### 2. Instantiate the plugin

The plugin accepts 1 optional parameter, which is an `Object` to configure the allowed tracking options.

```typescript
const plugin = networkCapturePlugin({
  ignoreHosts: ['host.com', 'host2.com'], // hosts to ignore; default []
  ignoreAmplitudeRequests: true, // ignore requests to amplitude.com; default "true",
  captureRules: [
    {hosts: ['host3.com', 'host4.com'], statusCodeRange: '400-499'},
    {hosts: ['example.com'], statusCodeRange: '403,500-599'},
  ],
});
```

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(plugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
