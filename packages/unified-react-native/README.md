# @amplitude/unified-react-native

Official Amplitude SDK wrapper for React Native Analytics, Experiment, Session Replay, and Guides and Surveys.

## Installation

```sh
npm install @amplitude/unified-react-native
```

For a bare React Native application, load the package's autolinking preset from your application-level `react-native.config.js`:

```javascript
module.exports = require('@amplitude/unified-react-native/react-native.config');
```

If your application already has a React Native configuration, merge the preset's `dependencies` with your existing configuration:

```javascript
const amplitude = require('@amplitude/unified-react-native/react-native.config');

module.exports = {
  // Your existing configuration
  dependencies: {
    ...amplitude.dependencies,
    // Your existing dependency overrides
  },
};
```

The preset lets React Native autolink the native blade modules installed transitively by the unified SDK. No blade package needs to be installed directly by the application.

The unified SDK requires React Native 0.76 or newer. Guides and Surveys uses React Native's typed native event emitters, so enable the React Native New Architecture before rebuilding. For Android, set `newArchEnabled=true` in `android/gradle.properties`; use your React Native version's corresponding New Architecture setup for iOS.

Install iOS pods after adding the package:

```sh
cd ios && pod install
```

## Usage

```typescript
import {
  experiment,
  init,
  track,
  Types,
} from '@amplitude/unified-react-native';

await init('YOUR_API_KEY', {
  // Shared defaults for every blade SDK
  serverZone: 'US',
  instanceName: 'app',
  logLevel: Types.LogLevel.Warn,

  analytics: {
    userId: 'user-id',
  },
  sessionReplay: {
    sampleRate: 1,
  },
  experiment: {
    deploymentKey: 'YOUR_DEPLOYMENT_KEY',
  },
  engagement: {
    locale: 'en-US',
  },
});

track('App Opened');
const variant = experiment()?.variant('experiment-key');
```

Options in `analytics`, `experiment`, `sessionReplay`, and `engagement` override the corresponding shared defaults.
Initialization is idempotent: subsequent `init()` calls return the first initialization promise and do not reconfigure the SDKs.
If initialization rejects, calling `init()` again removes any partially registered blades and retries their setup.

### Multiple instances

The unified React Native SDK does not support isolated multiple instances. The React Native Engagement plugin is a process-wide singleton, so every unified client created with `createInstance()` shares the same Engagement plugin and native Engagement instance. The first initialization supplies its API key and Engagement configuration; later clients cannot configure an independent Engagement instance and may update the same shared identity through subsequent boot operations.

Use the package-level `init()`, `track()`, and other singleton exports for normal applications. If you create clients explicitly, treat their Engagement state as shared rather than independent.

The package also exports the React Native Analytics helpers `Identify`, `Revenue`, and `Types`, plus `AmpMaskView` for Session Replay masking.
