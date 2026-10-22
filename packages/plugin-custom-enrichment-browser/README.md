<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/brand/amplitude-logo-with-text.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-custom-enrichment-browser

Official Browser SDK plugin for custom enrichment

## Installation

Version 1.0.0 introduces a breaking dependency change: `@amplitude/analytics-core` is now a required peer dependency (`^2.61.0`), rather than a regular dependency installed by the plugin.

If you only use this plugin through `@amplitude/analytics-browser`, install the Browser SDK as usual. A Browser SDK release that bundles this plugin version supplies the compatible core; your application does not need an additional core declaration.

If you install or import this plugin directly, declare a compatible core in your application's dependencies, even if you also install the Browser SDK. For example, after plugin 1.0.0 is published:

```sh
# npm
npm install @amplitude/plugin-custom-enrichment-browser@^1.0.0 @amplitude/analytics-core@^2.61.0

# yarn
yarn add @amplitude/plugin-custom-enrichment-browser@^1.0.0 @amplitude/analytics-core@^2.61.0
```

When also using the Browser SDK, align the supplied core with its version within the supported peer range. Without a declared peer, Yarn PnP cannot resolve the plugin's published TypeScript declarations. The plugin's JavaScript currently imports only types from core; this change does not reduce the runtime bundle.

## Usage

This plugin works on top of the Amplitude Browser SDK and allows custom functionality to execute on events. Plugin 1.0.0 requires a host that supplies core `^2.61.0`. This stable peer range does not promise support for arbitrary core prerelease versions.

### 1. Import Amplitude packages

* `@amplitude/plugin-custom-enrichment-browser`

```typescript
import { customEnrichmentPlugin } from '@amplitude/plugin-custom-enrichment-browser';
```

### 2. Instantiate custom enrichment plugin
```typescript
const customEnrichmentPlugin = customEnrichmentPlugin();
```

#### Options


### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(customEnrichmentPlugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Result
This plugin executes a user-defined script, defined within Amplitude Remote Configuration Settings.

#### Event type
* No event type added

#### Event properties
* Defined by user