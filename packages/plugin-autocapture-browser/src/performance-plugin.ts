/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  PerformanceTrackingOptions,
  Unsubscribable,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { trackLongTask } from './autocapture/track-long-task';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

const DEFAULT_LONG_TASK_DURATION_THRESHOLD = 50; // ms, browser minimum

export const performancePlugin = (options: PerformanceTrackingOptions = {}): BrowserEnrichmentPlugin => {
  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Unsubscribable[] = [];

  const longTaskEnabled = options.longTask !== false && options.longTask !== null;

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    if (longTaskEnabled) {
      let durationThreshold = DEFAULT_LONG_TASK_DURATION_THRESHOLD;
      if (typeof options.longTask === 'object' && options.longTask.durationThreshold !== undefined) {
        durationThreshold = options.longTask.durationThreshold;
      }

      const longTaskSubscription = trackLongTask({
        amplitude,
        options,
        durationThreshold,
      });
      subscriptions.push(longTaskSubscription);
    }

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} performance tracking has been successfully added.`);
  };

  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    for (const subscription of subscriptions) {
      subscription.unsubscribe();
    }
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
