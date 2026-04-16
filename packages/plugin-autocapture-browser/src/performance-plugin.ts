/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  PerformanceTrackingOptions,
  Unsubscribable,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { trackMainThreadBlock } from './autocapture/track-long-task';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

const DEFAULT_DURATION_THRESHOLD = 100; // ms

export const performancePlugin = (options: PerformanceTrackingOptions = {}): BrowserEnrichmentPlugin => {
  const name = constants.PERFORMANCE_PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Unsubscribable[] = [];

  const mainThreadBlockEnabled =
    options.mainThreadBlock === true ||
    (typeof options.mainThreadBlock === 'object' && options.mainThreadBlock !== null);

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    if (mainThreadBlockEnabled) {
      let durationThreshold = DEFAULT_DURATION_THRESHOLD;
      if (typeof options.mainThreadBlock === 'object' && options.mainThreadBlock.durationThreshold !== undefined) {
        durationThreshold = options.mainThreadBlock.durationThreshold;
      }

      const subscription = trackMainThreadBlock({
        amplitude,
        options,
        durationThreshold,
      });
      subscriptions.push(subscription);
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
