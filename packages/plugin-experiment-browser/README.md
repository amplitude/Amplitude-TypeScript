<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/plugin-experiment-browser

Official Browser SDK plugin for Amplitude Experiment integration

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/plugin-experiment-browser

# yarn
yarn add @amplitude/plugin-experiment-browser
```

## Usage

This plugin works on top of Amplitude Browser SDK and adds Amplitude Experiment integration features. To use this plugin, you need to install `@amplitude/analytics-browser` version `v2.17.5` or later.

### 1. Import Amplitude packages

* `@amplitude/plugin-experiment-browser`

```typescript
import { experimentPlugin } from '@amplitude/plugin-experiment-browser';
```

### 2. Instantiate experiment plugin

The plugin accepts an optional parameter of type `ExperimentPluginConfig` to configure the plugin based on your use case.

```typescript
const experiment = experimentPlugin({
  deploymentKey: 'DEPLOYMENT_KEY', // Optional if using the same key as analytics
  // Other experiment configuration options
});
```

#### Options

|Name|Type|Default|Description|
|-|-|-|-|
|`deploymentKey`|`string`|`undefined`|The deployment key for Amplitude Experiment. If not provided, the plugin will use the Amplitude API key.|
|`...`|`ExperimentConfig`|`{}`|All other configuration options from `@amplitude/experiment-js-client`.|

### 3. Install plugin to Amplitude SDK

```typescript
amplitude.add(experiment);
```

### 4. Initialize Amplitude SDK

```typescript
amplitude.init('API_KEY');
```

## Experiment Integration

This plugin integrates Amplitude Experiment with Amplitude Analytics. The plugin:

1. Automatically initializes the Experiment client using the Amplitude Analytics configuration
2. Sets up the connection between Experiment and Analytics for consistent user identity
3. Allows you to use all features of the Experiment client while maintaining the connection with Analytics

### Accessing the Experiment client

The Experiment client is accessible through the plugin instance:

```typescript
const plugin = experimentPlugin(config);
amplitude.add(plugin);
amplitude.init('API_KEY');

// Now you can access the Experiment client
const variant = await plugin.experiment.fetch();
```

## Learn More

For more information about Amplitude Experiment, visit the [official documentation](https://www.docs.developers.amplitude.com/experiment/).
