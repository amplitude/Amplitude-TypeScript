# @amplitude/unified-react-native

Official Amplitude SDK wrapper for React Native Analytics, Experiment, Session Replay, and Guides and Surveys.

## Installation

```sh
npm install \
  @amplitude/unified-react-native \
  @amplitude/analytics-react-native \
  @amplitude/plugin-experiment-react-native \
  @amplitude/plugin-session-replay-react-native \
  @amplitude/plugin-engagement-react-native \
  @react-native-async-storage/async-storage
```

React Native autolinking discovers native modules declared directly by the application, so install the blade packages and AsyncStorage as direct application dependencies even though the unified wrapper also depends on them.

Install iOS pods after adding the package:

```sh
cd ios && pod install
```

## Usage

```typescript
import {
  engagement,
  experiment,
  initAll,
  LogLevel,
  sessionReplay,
  track,
} from '@amplitude/unified-react-native';

await initAll('YOUR_API_KEY', {
  // Shared defaults for every blade SDK
  serverZone: 'US',
  instanceName: 'app',
  logLevel: LogLevel.Warn,

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
await experiment()?.start();
const variant = experiment()?.variant('experiment-key');
await sessionReplay()?.start();
await engagement.boot('user-id');
```

Options in `analytics`, `experiment`, `sessionReplay`, and `engagement` override the corresponding shared defaults.

The package also re-exports the React Native Analytics API, Experiment client types, `AmpMaskView` for Session Replay masking, and the Guides and Surveys API under the `engagement` namespace.
