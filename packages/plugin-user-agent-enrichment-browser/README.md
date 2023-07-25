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

This plugin works on top of the Amplitude Browser SDK. It's used for enriching events with user agent information using the @amplitude/ua-parser-js. The user agent identifies the application, operating system, vendor, and/or version of the requesting client.
For Browser SDK v1.x, we use @amplitude/ua-parser-js internally to parse the user agent information. In Browser v2.x, we have removed this client-side user agent parser and have instead implemented server-side user agent parser. You can use this plugin to maintain consistency with the user agent information from earlier SDK versions.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-user-agent-enrichment-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { userAgentEnrichmentPlugin } from '@amplitude/plugin-user-agent-enrichment-browser';
```

### 2. Instantiate user agent enrichment plugin

The plugin accepts 1 optional parameter, which is an `Object` to disable/enable the corresponding tracking options. Each option is enabled by default.

```typescript
const uaPlugin = userAgentEnrichmentPlugin({
  osName: true,
  osVersion: true,
  deviceManufacturer: false,
  deviceModel: false,
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`osName`|`boolean`|`true`| Enables enrichment of `os_name` property. |
|`osVersion`|`boolean`|`true`| Enables enrichment of `os_version` property. |
|`deviceManufacturer`|`boolean`|`true`| Enables enrichment of `device_manufacturer` property. |
|`deviceModel`|`boolean`|`true`| Enables enrichment of `device_model` property. |

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(uaPlugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Resulting page view event

This plugin parses user agent information using @amplitude/ua-parser-js and enriches events based on your configuration. This affects the value of the following properties: `device_family`, `device_model`, `device_manufacturer`, `device_type`, `os`, `os_name`, and `os_version`.