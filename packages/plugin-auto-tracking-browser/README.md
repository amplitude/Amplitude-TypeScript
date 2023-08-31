<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-auto-tracking-browser

Official Browser SDK plugin for auto-tracking.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-auto-tracking-browser

# yarn
yarn add @amplitude/plugin-auto-tracking-browser
```

## Usage

This plugin works on top of the Amplitude Browser SDK, generating auto-tracked events and sending to Amplitude.

To use this plugin, you need to install `@amplitude/analytics-browser` version `v1.9.1` or later.

### 1. Import Amplitude packages

* `@amplitude/analytics-browser`
* `@amplitude/plugin-auto-tracking-browser`

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { autoTrackingPlugin } from '@amplitude/plugin-auto-tracking-browser';
```

### 2. Instantiate the plugin

The plugin accepts 1 optional parameter, which is an `Object` to configure the allowed tracking options.

```typescript
const plugin = autoTrackingPlugin({
  cssSelectorAllowlist: ['.amp-auto-tracking', '[amp-auto-tracking]'],
  tagAllowlist: ['button', 'a'],
});
```

Examples:
- The above `cssSelectorAllowlist` will only allow tracking elements like:
    - `<button amp-auto-tracking>Click</button>`
    - `<a class="amp-auto-tracking">Link</a>`
- The above `tagAllowlist` will only allow `button` and `a` tags to be tracked.

Note `ingestionMetadata` is for internal use only, you don't need to provide it.

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`cssSelectorAllowlist`|`string[]`|`undefined`| When provided, only allow elements matching any selector to be tracked. |
|`tagAllowlist`|`string[]`|`['a', 'button', 'input', 'select', 'textarea', 'label']`| Only allow elements with tag in this list to be tracked. |

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(plugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
