<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-ga-events-forwarder-browser

Official Browser SDK plugin for Google Analytics events listener

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-ga-events-forwarder-browser

# yarn
yarn add @amplitude/plugin-ga-events-forwarder-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK which listens for events tracked using Google Analytics and sends these events to Amplitude. To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.9.1` or later.

### 1. Import Amplitude packages

* `@amplitude/plugin-ga-events-forwarder-browser`

```typescript
import { gaEventsForwarderPlugin } from '@amplitude/plugin-ga-events-forwarder-browser';
```

### 2. Instantiate Google Analytics event listener

```typescript
const gaEventsForwarder = gaEventsForwarderPlugin();
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`trackingIds`|`string` or `string[]`|A Google Analytics tracking ID or a list of Google Analytics tracking IDs. This limits the plugin to only listen for events tracked with the specified tracking ID/s.<br/><br/>To listen for a single Google Tracking ID, pass a string, eg: <br/><br/>```const gaEventsForwarder = gaEventsForwarderPlugin({ trackingIds: 'G-XXXXXXXXXX' });```<br/><br/>To listen for multiple Google Tracking IDs, pass an array of strings, eg: <br/><br/>````const gaEventsForwarder = gaEventsForwarderPlugin({ trackingIds: ['G-XXXXXXXXXX', 'G-YYYYYYYYYY'] });````|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(gaEventsForwarder);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
