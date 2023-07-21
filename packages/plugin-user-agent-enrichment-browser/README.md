<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-user-agent-enrichment-browser

Official Browser SDK plugin for user agent enrichment.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-user-agent-enrichment-browser@^1.0.0

# yarn
yarn add @amplitude/plugin-user-agent-enrichment-browser@^1.0.0
```

## Usage

This plugin works on top of the Amplitude Browser SDK. It's used for enriching your user agent information using the @amplitude/ua-parser-js npm package. The user agent identifies the application, operating system, vendor, and/or version of the requesting client. You can use this plugin to maintain the user agent information's consistency with earlier versions.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-user-agent-enrichment-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { userAgentEnrichmentPlugin } from '@amplitude/plugin-user-agent-enrichment-browser';
```

### 2. Instantiate user agent enrichment plugin

The plugin accepet 1 optional parameter, which is an `Object` for disable/enable the corrosponding tracking options. Each options are enabled by default.

```typescript
const userAgentEnrichmentPlugin = userAgentEnrichmentPlugin({
  osName: true,
  osVersion: true,
  deviceManufacturer: false,
  deviceModel: false,
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|
|`osName`|`boolean`|`true`| Whether to track the `os_name` using this plugin. |
|`osVersion`|`boolean`|`true`| Whether to track the `os_version` using this plugin. |
|`deviceManufacturer`|`boolean`|`true`| Whether to track the ``device_manufacturer` using this plugin. |
|`deviceModel`|`boolean`|`true`| Whether to track the `device_model` using this plugin. |

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(pageViewTracking);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Resulting page view event

This plugin derieve the user agent information using @amplitude/ua-parser-js based on your configuration. It might finally effect the value or the format of `device_family`, `device_family`, `device_model`, `device_manufacturer`, `device_type`, `os`, `os_name`, `os_version` in the event property.
