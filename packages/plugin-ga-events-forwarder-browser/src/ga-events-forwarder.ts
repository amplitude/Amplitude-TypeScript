import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BaseEvent, BrowserClient, BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
import { GA_PAYLOAD_HOSTNAME_VALUE, GA_PAYLOAD_PATHNAME_VALUE } from './constants';
import { isTrackingIdAllowed, isVersionSupported, parseGA4Events, transformToAmplitudeEvents } from './helpers';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;
interface Options {
  trackingIds?: string | string[];
}

/**
 * Returns an instance of `gaEventsForwarderPlugin`. Add this plugin to listen for events sent to Google Analytics,
 * transform the events and send the events to Amplitude.
 *
 * ```html
 * <script>
 *   amplitude.add(gaEventsForwarder.plugin());
 *   amplitude.init(<API_KEY>);
 * </script>
 * <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
 * <script>
 *   window.dataLayer = window.dataLayer || [];
 *   function gtag(){
 *     dataLayer.push(arguments);
 *   }
 *   gtag('js', new Date());
 *   gtag('config', 'G-XXXXXXXXXX');
 * </script>
 * ```
 *
 * @param options An object containing plugin options. Options include `trackingIds`.
 *
 * @param options.trackingIds A Google Analytics tracking ID or a list of Google Analytics tracking IDs.
 * This limits the plugin to only listen for events tracked with the specified tracking ID/s.
 */
export const gaEventsForwarderPlugin = ({ trackingIds = [] }: Options = {}): BrowserEnrichmentPlugin => {
  const globalScope = getGlobalScope();
  const trackingIdList = typeof trackingIds === 'string' ? [trackingIds] : trackingIds;
  const isTrackingIdListValid = Array.isArray(trackingIdList) && !trackingIdList.some((id) => typeof id !== 'string');
  let amplitude: BrowserClient | undefined = undefined;
  let logger: Logger | undefined = undefined;
  let preSetupEventQueue: BaseEvent[] = [];
  let sendBeacon: undefined | ((url: string | URL, data?: BodyInit | null | undefined) => boolean);

  /**
   * Creates proxy for `navigator.sendBeacon` immediately to start listening for events.
   * Google Analytics may start sending events before Amplitude SDK is initialized.
   */
  if (globalScope && isTrackingIdListValid) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sendBeacon = globalScope.navigator.sendBeacon;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    globalScope.navigator.sendBeacon = new Proxy(globalScope.navigator.sendBeacon, {
      apply: (target, thisArg, [url, body]: [string, BodyInit | undefined]) => {
        // Intercepts request and attempt to send to Amplitude
        interceptRequest(new URL(url), body);
        // Execute sendBeacon
        target.apply(thisArg, [url, body]);
      },
    });
  }

  /**
   * 1. Parses the event payload of requests to GA4
   * 2. Transforms GA4 events to Amplitude Events
   * 3a: Pushes to preSetupEventQueue while waiting for Amplitude SDK to initialize
   * 3b. Sends events to Amplitude after Amplitude SDK is initialized
   */
  const interceptRequest = (url: URL, data?: BodyInit) => {
    if (
      url.hostname === GA_PAYLOAD_HOSTNAME_VALUE &&
      url.pathname === GA_PAYLOAD_PATHNAME_VALUE &&
      isTrackingIdAllowed(url, trackingIdList) &&
      isVersionSupported(url)
    ) {
      const ga4Events = parseGA4Events(url, data);
      const amplitudeEvents = transformToAmplitudeEvents(ga4Events);
      for (const event of amplitudeEvents) {
        if (!amplitude) {
          preSetupEventQueue.push(event);
        } else {
          amplitude.track(event);
        }
      }
    }
  };

  const name = '@amplitude/plugin-gtag-forwarder-browser';
  const type = 'enrichment';
  const setup: BrowserEnrichmentPlugin['setup'] = async (configParam, amplitudeParam) => {
    logger = configParam.loggerProvider;

    /* istanbul ignore if */
    if (!globalScope) {
      logger.error(`${name} is not compatible with a non-browser environment.`);
      return;
    }

    if (!isTrackingIdListValid) {
      logger.error(
        `${name} received an invalid input for Tracking IDs. Tracking IDs must be a string or an array of strings.`,
      );
      return;
    }

    if (!amplitudeParam) {
      logger.error(
        `${name} is not compatible with Amplitude SDK version. This plugin requires Amplitude SDK version 1.9.1 or later.`,
      );
      void teardown();
      return;
    }

    // Sends events tracked before Amplitude SDK was initialized
    preSetupEventQueue.forEach((event) => amplitudeParam.track(event));
    preSetupEventQueue = [];
    amplitude = amplitudeParam;

    logger.log(`${name} is successfully added.`);
  };
  const execute: BrowserEnrichmentPlugin['execute'] = async (e) => e;
  const teardown = async () => {
    if (globalScope && sendBeacon) {
      globalScope.navigator.sendBeacon = sendBeacon;
      /* istanbul ignore next */
      logger?.log(`${name} is removed.`);
    }
    preSetupEventQueue = [];
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
