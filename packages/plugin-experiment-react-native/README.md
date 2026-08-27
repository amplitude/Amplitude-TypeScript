<p align="center">
  <a href="https://amplitude.com" target="_blank" align="center">
    <img src="https://static.amplitude.com/lightning/46c85bfd91905de8047f1ee65c7c93d6fa9ee6ea/static/media/amplitude-logo-with-text.4fb9e463.svg" width="280">
  </a>
</p>

# @amplitude/plugin-experiment-react-native

Official React Native Analytics plugin for Amplitude Experiment integration.

## Installation

```sh
npm install @amplitude/analytics-react-native @amplitude/plugin-experiment-react-native
```

## Usage

Create the plugin, add it to the React Native Analytics client, and initialize Analytics. The Experiment client is
available on the plugin after Analytics initialization completes.

```typescript
import { add, init } from '@amplitude/analytics-react-native';
import { experimentPlugin } from '@amplitude/plugin-experiment-react-native';

const experiment = experimentPlugin({
  deploymentKey: 'DEPLOYMENT_KEY', // Optional when Experiment and Analytics use the same project key.
});

await add(experiment).promise;
await init('AMPLITUDE_API_KEY').promise;

await experiment.experiment?.start();
const variant = experiment.experiment?.variant('experiment-key');
```

The plugin accepts all options from `ExperimentConfig` in `@amplitude/experiment-react-native-client`, plus:

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `deploymentKey` | `string` | Analytics API key | The deployment key for Amplitude Experiment. |

By default, `serverZone` and `instanceName` are inherited from the Analytics client so Experiment identity and exposure
events use the same Analytics instance. Explicit Experiment configuration takes precedence.

## Integration behavior

The plugin uses `Experiment.initializeWithAmplitudeAnalytics`, which connects Experiment to the Analytics identity store
and event bridge. It does not duplicate identity or exposure tracking logic. Removing the plugin stops the Experiment
client.

For more information, see the [Amplitude Experiment React Native SDK documentation](https://amplitude.com/docs/sdks/experiment-sdks/experiment-react-native).
