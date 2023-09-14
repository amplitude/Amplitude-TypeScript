<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-global-user-properties

Official SDK plugin for adding global user properties to events

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-global-user-properties

# yarn
yarn add @amplitude/plugin-global-user-properties
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds web attribution tracking features to built-in features. To use this plugin, you need to install `@amplitude/plugin-global-user-properties `v0.0.0` or later.

### 1. Import Amplitude packages

* `@amplitude/plugin-global-user-properties`

```typescript
import * as Amplitude from '@amplitude/analytics-browser'
import { globalUserPropertiesPlugin } from '@amplitude/plugin-global-user-properties';
```

### 2. Instantiate page view plugin

The plugin accepts an optional parameter of type `Object` to configure the plugin based on your use case.

```typescript
const globalUserPropertiesPlugin = globalUserPropertiesPlugin({
  shouldKeepOriginalUserProperties: true,
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`shouldKeepOriginalUserProperties`|`boolean`| `false` | Use this option if you want the user properties to be sent along with the global user properties. Since global user properties do not appear in Governance yet, this would |

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(globalUserPropertiesPlugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

