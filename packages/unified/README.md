<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
  <br />
</p>

# @amplitude/unified

Official Amplitude SDK for Web analytics, experiment, session replay, and more.

## Installation

This package is published on NPM registry and is available to be installed using npm and yarn.

```sh
# npm
npm install @amplitude/unified

# yarn
yarn add @amplitude/unified
```

## Usage

The Unified SDK provides a single entry point for all Amplitude features, including Analytics, Experiment, and Session Replay. It simplifies the integration process by handling the initialization and configuration of all components.

### 1. Import Amplitude Unified SDK

```typescript
import { initAll } from '@amplitude/unified';
```

### 2. Initialize the SDK

```typescript
initAll('YOUR_API_KEY', {
  // Shared options for all SDKs (optional)
  serverZone: 'US', // or 'EU'
  instanceName: 'my-instance',
  
  // Analytics options
  analytics: {
    // Analytics configuration options
  },
  
  // Session Replay options
  sr: {
    // Session Replay configuration options
  },
  
  // Experiment options
  experiment: {
    // Experiment configuration options
  }
});
```

### 3. Access SDK Features

The Unified SDK provides access to all Amplitude features through a single interface:

```typescript
import { 
  track, 
  identify, 
  experiment, 
  sr 
} from '@amplitude/unified';

// Track events
track('Button Clicked', { buttonName: 'Sign Up' });

// Identify users
identify(new Identify().set('userType', 'premium'));

// Access Experiment features
const variant = await experiment.fetch('experiment-key');

// Access Session Replay features
sr.startRecording();
```

## Configuration Options

### Shared Options

|Name|Type|Default|Description|
|-|-|-|-|
|`serverZone`|`'US'` or `'EU'`|`'US'`|The server zone to use for all SDKs.|
|`instanceName`|`string`|`undefined`|A unique name for this instance of the SDK.|

### Analytics Options

All options from `@amplitude/analytics-browser` are supported. See the [Analytics Browser SDK documentation](https://www.docs.developers.amplitude.com/analytics/browser/) for details.

### Session Replay Options

All options from `@amplitude/plugin-session-replay-browser` are supported. See the [Session Replay documentation](https://www.docs.developers.amplitude.com/session-replay/) for details.

### Experiment Options

All options from `@amplitude/plugin-experiment-browser` are supported. See the [Experiment documentation](https://www.docs.developers.amplitude.com/experiment/) for details.

## Learn More

- [Analytics Browser SDK Documentation](https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2)
- [Session Replay Documentation](https://amplitude.com/docs/session-replay/session-replay-standalone-sdk)
- [Experiment Documentation](https://amplitude.com/docs/sdks/experiment-sdks/experiment-javascript)
