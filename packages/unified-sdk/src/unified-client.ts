import { AmplitudeReturn, BrowserOptions, BrowserClient } from '@amplitude/analytics-types';
import { Client, Experiment, ExperimentConfig } from '@amplitude/experiment-js-client';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { SessionReplayOptions } from '@amplitude/plugin-session-replay-browser/lib/scripts/typings/session-replay';

import { createInstance } from '@amplitude/analytics-browser';

interface UnifiedClient {
  init(
    apiKey: string,
    options?: BrowserOptions,
    srOptions?: SessionReplayOptions,
    experimentOptions?: { deploymentKey?: string; experimentConfig?: ExperimentConfig },
  ): AmplitudeReturn<void>;
}

export class AmplitudeUnified implements UnifiedClient {
  // init() will always be called and the following will be initialized there
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  analytics: BrowserClient;
  experiment?: Client;

  init(
    apiKey: string,
    options?: BrowserOptions,
    srOptions?: SessionReplayOptions,
    experimentOptions?: { deploymentKey: string; experimentConfig?: ExperimentConfig },
  ) {
    // Initialize analytics SDK
    this.analytics = createInstance();
    this.analytics.init(apiKey, options);

    // Install SR plugin
    const srPlugin = sessionReplayPlugin(srOptions);
    this.analytics.add(srPlugin);

    // Initialize experiment SDK
    if (experimentOptions) {
      this.experiment = Experiment.initializeWithAmplitudeAnalytics(
        experimentOptions.deploymentKey,
        experimentOptions.experimentConfig,
      );
    }

    return returnWrapper(Promise.resolve());
  }
}
