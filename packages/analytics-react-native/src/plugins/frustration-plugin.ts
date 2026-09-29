import {
  EnrichmentPlugin,
  ReactNativeClient,
  ReactNativeConfig,
  ReactNativeFrustrationInteractionsOptions,
} from '@amplitude/analytics-core';
import * as Capture from '../amp-capture';
import { getElementInteractionEventProperties } from '../autocapture/element-interaction';
import { createRageClickTracker, getRageClickEventProperties, getRageClickStartTime } from '../autocapture/rage-click';
import { DEFAULT_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';

export const FRUSTRATION_PLUGIN_NAME = '@amplitude/plugin-frustration-react-native';

type ReactNativeEnrichmentPlugin = EnrichmentPlugin<ReactNativeClient, ReactNativeConfig>;

export interface FrustrationPluginOptions extends ReactNativeFrustrationInteractionsOptions {
  /**
   * Returns the name of the screen currently being viewed so it can be attached to
   * frustration events as `[Amplitude] Screen Name`.
   */
  getScreenName?: () => string | undefined;
}

/**
 * Tracks frustration interactions (currently `[Amplitude] Rage Click`) from presses
 * captured through `ampCapture`.
 */
export const frustrationPlugin = (options: FrustrationPluginOptions = {}): ReactNativeEnrichmentPlugin => {
  const name = FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  const rageClicksEnabled = options.rageClick !== false;

  let subscriptions: (() => void)[] = [];

  const setup: ReactNativeEnrichmentPlugin['setup'] = async (config, amplitude) => {
    if (rageClicksEnabled) {
      const rageClickTracker = createRageClickTracker((clickData) => {
        const time = getRageClickStartTime(clickData);
        const eventProperties = getRageClickEventProperties(clickData);
        amplitude.track(DEFAULT_ELEMENT_RAGE_CLICKED_EVENT, eventProperties, { time });
      });

      let unregisterRageClickEvent: (() => void) | undefined;
      const captureUnsubscribe = Capture.subscribe((properties, coordinates) => {
        if (properties.action !== 'Press' || !coordinates) {
          return;
        }
        unregisterRageClickEvent = rageClickTracker.registerClickEvent(
          coordinates,
          getElementInteractionEventProperties(properties, options.getScreenName?.()),
        );
      });

      subscriptions.push(captureUnsubscribe, () => unregisterRageClickEvent?.());
    }

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);
  };

  const execute: ReactNativeEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
    subscriptions = [];
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
