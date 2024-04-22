<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-autocapture-browser (beta)
**This plugin is in beta at the moment, naming and interface might change in the future.**

Browser SDK plugin for autocapture.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-autocapture-browser@beta

# yarn
yarn add @amplitude/plugin-autocapture-browser@beta
```

## Usage

This plugin works on top of the Amplitude Browser SDK, generating auto-tracked events and sending to Amplitude.

To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.9.1` or later.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-autocapture-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { autocapturePlugin } from '@amplitude/plugin-autocapture-browser';
```

### 2. Instantiate the plugin

The plugin accepts 1 optional parameter, which is an `Object` to configure the allowed tracking options.

```typescript
const plugin = autocapturePlugin({
  cssSelectorAllowlist: [
    '.amp-tracking',
    '[amp-tracking]'
  ],
  pageUrlAllowlist: [
    'https://amplitude.com',
    new RegExp('https://amplitude.com/blog/*')
  ],
});
```

Examples:
- The above `cssSelectorAllowlist` will only allow tracking elements like:
    - `<button amp-tracking>Click</button>`
    - `<a class="amp-tracking">Link</a>`
- The above `pageUrlAllowlist` will only allow the elements on URL "https://amplitude.com" or any URL matching the "https://amplitude.com/blog/*" to be tracked

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`cssSelectorAllowlist`|`string[]`|`['a', 'button', 'input', 'select', 'textarea', 'label', '[data-amp-default-track]', '.amp-default-track']`| When provided, only allow elements matching any selector to be tracked. |
|`pageUrlAllowlist`|`(string\|RegExp)[]`|`undefined`| When provided, only allow elements matching URLs to be tracked. |
|`shouldTrackEventResolver`|`(actionType: ActionType, element: Element) => boolean`|`undefined`| When provided, overwrite all other allowlists and configurations. |
|`dataAttributePrefix`|`string`|`'data-amp-track-'`| Allow data attributes to be collected in event property. |

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(plugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
