<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-web-attribution-browser

Official Browser SDK plugin for web attribution tracking

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-web-attribution-browser

# yarn
yarn add @amplitude/plugin-web-attribution-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds web attribution tracking features to built-in features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.4.0` or later.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-web-attribution-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
```

### 2. Instantiate page view plugin

The plugin requires 1 parameter, which is the `amplitude` instance. The plugin also accepts an optional second parameter, which is an `Object` to configure the plugin based on your use case.

```typescript
const webAttributionTracking = webAttributionPlugin(amplitude, {
  disabled: undefined,
  excludeReferrers: undefined,
  initialEmptyValue: undefined,
  resetSessionOnNewCampaign: undefined,
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`disabled`|`boolean`|`false`|Use this option to enable or disable web attribution tracking. By default, upon installing this plugin, web attribution tracking is enabled.|
|`excludeReferrers`|`string[]`|`[]`|Use this option to prevent the plugin from tracking campaigns parameters from specific referrers. For example: `subdomain.domain.com`.|
|`initialEmptyValue`|`string`|`"EMPTY"`|Use this option to specify empty values for [first-touch attribution](https://www.docs.developers.amplitude.com/data/sdks/marketing-analytics-browser/#first-touch-attribution).|
|`resetSessionOnNewCampaign`|`boolean`|`false`|Use this option to control whether a new session should start on a new campaign.|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(webAttributionTracking);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
