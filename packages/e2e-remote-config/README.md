<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-stub-browser (beta)
**This plugin is in beta at the moment, naming and interface might change in the future.**

A stub plugin. Copy and paste this and rename to make a new plugin.

And remove the "private: true" attribute from package.json

## Installation

This package is not published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-stub-browser@beta

# yarn
yarn add @amplitude/plugin-stub-browser@beta
```

## Usage

```typescript
import * as amplitude from '@amplitude/analytics-browser';
import { stubPlugin } from '@amplitude/plugin-stub-browser';
```

### 2. Instantiate the plugin

```typescript
const plugin = stubPlugin();
```

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(plugin);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```
