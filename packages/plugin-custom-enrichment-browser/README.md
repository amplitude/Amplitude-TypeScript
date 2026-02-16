<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-custom-enrichment-browser

Official Browser SDK plugin for custom enrichment

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-custom-enrichment-browser

# yarn
yarn add @amplitude/plugin-custom-enrichment-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and allows the user to execute custom functionality on their events. To use this plugin, you need to install `@amplitude/analytics-browser` version `v2.0.0` or later.

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