import {
  EnrichmentPlugin,
  ReactNativeClient,
  ReactNativeConfig,
  ReactNativeFrustrationInteractionsOptions,
} from '@amplitude/analytics-core';
import * as Capture from '../amp-capture';
import {
  createErrorClickTracker,
  createErrorObservable,
  getErrorClickEventProperties,
} from '../autocapture/error-click';
import { createDeadClickTracker, getDeadClickEventProperties } from '../autocapture/dead-click';
import { getElementInteractionEventProperties } from '../autocapture/element-interaction';
import { subscribeToSessionReplayInterfaceSignals } from '../autocapture/interface-signals';
import { createRageClickTracker, getRageClickEventProperties, getRageClickStartTime } from '../autocapture/rage-click';
import {
  DEFAULT_ELEMENT_DEAD_CLICKED_EVENT,
  DEFAULT_ELEMENT_ERROR_CLICKED_EVENT,
  DEFAULT_ELEMENT_RAGE_CLICKED_EVENT,
} from '../constants';

export const FRUSTRATION_PLUGIN_NAME = '@amplitude/plugin-frustration-react-native';

type ReactNativeEnrichmentPlugin = EnrichmentPlugin<ReactNativeClient, ReactNativeConfig>;

export interface FrustrationPluginOptions extends ReactNativeFrustrationInteractionsOptions {
  errorClick?: boolean;
  deadClick?: boolean;
  /**
   * Returns the name of the screen currently being viewed so it can be attached to
   * frustration events as `[Amplitude] Screen Name`.
   */
  getScreenName?: () => string | undefined;
}

/**
 * Tracks frustration interactions from presses
 * captured through `ampCapture`.
 */
export const frustrationPlugin = (options: FrustrationPluginOptions = {}): ReactNativeEnrichmentPlugin => {
  const name = FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  const rageClicksEnabled = options.rageClick !== false;
  const errorClicksEnabled = options.errorClick !== false;
  const deadClicksEnabled = options.deadClick !== false;

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

    if (errorClicksEnabled) {
      const errorClickTracker = createErrorClickTracker((errorClickData) => {
        amplitude.track(DEFAULT_ELEMENT_ERROR_CLICKED_EVENT, getErrorClickEventProperties(errorClickData));
      });

      let unregisterErrorClickEvent: (() => void) | undefined;
      const captureUnsubscribe = Capture.subscribe((properties) => {
        if (properties.action !== 'Press' && properties.action !== 'LongPress') {
          return;
        }
        unregisterErrorClickEvent = errorClickTracker.registerClickEvent(
          getElementInteractionEventProperties(properties, options.getScreenName?.()),
        );
      });
      const errorUnsubscribe = createErrorObservable(errorClickTracker.registerErrorEvent);

      subscriptions.push(captureUnsubscribe, errorUnsubscribe, () => unregisterErrorClickEvent?.());
    }

    if (deadClicksEnabled) {
      const deadClickTracker = createDeadClickTracker((clickData) => {
        amplitude.track(DEFAULT_ELEMENT_DEAD_CLICKED_EVENT, getDeadClickEventProperties(clickData), {
          time: clickData.time,
        });
      });

      let unregisterDeadClickEvent: (() => void) | undefined;
      const captureUnsubscribe = Capture.subscribe((properties, coordinates) => {
        if (properties.action !== 'Press' || !coordinates) {
          return;
        }
        unregisterDeadClickEvent = deadClickTracker.registerClickEvent(
          coordinates,
          getElementInteractionEventProperties(properties, options.getScreenName?.()),
        );
      });
      const interfaceSignalUnsubscribe = subscribeToSessionReplayInterfaceSignals({
        onInterfaceChanged: deadClickTracker.registerInterfaceChange,
        onProviderChanged: deadClickTracker.setProvidingInterfaceSignals,
      });

      subscriptions.push(
        captureUnsubscribe,
        interfaceSignalUnsubscribe,
        () => unregisterDeadClickEvent?.(),
        deadClickTracker.reset,
      );
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
