import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BaseEvent, BrowserClient, BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
import {
  AMPLITUDE_EVENT_LIBRARY,
  GA_AUTOMATIC_EVENT_FILE_DOWNLOAD,
  GA_AUTOMATIC_EVENT_FORM_START,
  GA_AUTOMATIC_EVENT_FORM_SUBMIT,
  GA_AUTOMATIC_EVENT_PAGE_VIEW,
  GA_AUTOMATIC_EVENT_SESSION_START,
  GA_SERVICE_ROOT_DOMAIN_VALUES,
  GA_PAYLOAD_PATHNAME_VALUE,
} from './constants';
import {
  getDefaultEventTrackingConfig,
  isMeasurementIdTracked,
  isVersionSupported,
  parseGA4Events,
  transformToAmplitudeEvents,
} from './helpers';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;
interface Options {
  measurementIds?: string | string[];
}

type SendBeaconFn = typeof navigator.sendBeacon;

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
 * @param options An object containing plugin options. Options include `measurementIds`.
 *
 * @param options.measurementIds A Google Analytics measurement ID or a list of Google Analytics measurement IDs.
 * This limits the plugin to only listen for events tracked with the specified measurement ID/s.
 */
export const gaEventsForwarderPlugin = ({ measurementIds = [] }: Options = {}): BrowserEnrichmentPlugin => {
  const globalScope = getGlobalScope();
  const measurementIdList = typeof measurementIds === 'string' ? [measurementIds] : measurementIds;
  const isMeasurementIdListValid =
    Array.isArray(measurementIdList) && !measurementIdList.some((id) => typeof id !== 'string');
  let amplitude: BrowserClient | undefined = undefined;
  let logger: Logger | undefined = undefined;
  let preSetupEventQueue: BaseEvent[] = [];
  let sendBeacon: undefined | SendBeaconFn;
  let trackFileDownloads = false;
  let trackFormInteractions = false;
  let trackPageViews = false;
  let trackSessions = false;

  /**
   * Creates proxy for `navigator.sendBeacon` immediately to start listening for events.
   * Google Analytics may start sending events before Amplitude SDK is initialized.
   */
  if (globalScope && isMeasurementIdListValid) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sendBeacon = globalScope.navigator.sendBeacon;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    globalScope.navigator.sendBeacon = new Proxy(globalScope.navigator.sendBeacon, {
      apply: (target: SendBeaconFn, thisArg: any, argArray: Parameters<SendBeaconFn>) => {
        // Intercepts request and attempt to send to Amplitude
        intercept.apply(thisArg, argArray);
        // Execute sendBeacon
        return target.apply(thisArg, argArray);
      },
    });
  }

  /**
   * 1. Parses the event payload of requests to GA4
   * 2. Transforms GA4 events to Amplitude Events
   * 3a: Pushes to preSetupEventQueue while waiting for Amplitude SDK to initialize
   * 3b. Sends events to Amplitude after Amplitude SDK is initialized
   */
  const intercept: SendBeaconFn = (requestUrl, data) => {
    try {
      const url = new URL(requestUrl);
      if (
        GA_SERVICE_ROOT_DOMAIN_VALUES.some((rootDomain) => url.hostname.endsWith(rootDomain)) &&
        url.pathname === GA_PAYLOAD_PATHNAME_VALUE &&
        isMeasurementIdTracked(url, measurementIdList) &&
        isVersionSupported(url)
      ) {
        const ga4Events = parseGA4Events(url, data);
        const amplitudeEvents = transformToAmplitudeEvents(ga4Events);
        for (const event of amplitudeEvents) {
          if (!amplitude) {
            preSetupEventQueue.push(event);
          } else {
            processEvent(event);
          }
        }
      }
      return true;
    } catch (error) {
      /* istanbul ignore next */
      logger?.error(String(error));
      return false;
    }
  };

  const processEvent = (event: BaseEvent) => {
    /* istanbul ignore if */
    if (!amplitude || !logger) {
      // Should not be possible, and only added to fulfill typechecks
      return;
    }

    if (
      (trackFileDownloads && event.event_type === GA_AUTOMATIC_EVENT_FILE_DOWNLOAD) ||
      (trackFormInteractions && event.event_type === GA_AUTOMATIC_EVENT_FORM_START) ||
      (trackFormInteractions && event.event_type === GA_AUTOMATIC_EVENT_FORM_SUBMIT) ||
      (trackPageViews && event.event_type === GA_AUTOMATIC_EVENT_PAGE_VIEW) ||
      (trackSessions && event.event_type === GA_AUTOMATIC_EVENT_SESSION_START)
    ) {
      logger.log(`${name} skipped ${event.event_type} because it is tracked by Amplitude.`);
      return;
    }

    amplitude.track(event);
  };

  const name = '@amplitude/plugin-gtag-forwarder-browser';
  const type = 'enrichment';
  const setup: BrowserEnrichmentPlugin['setup'] = async (configParam, amplitudeParam) => {
    logger = configParam.loggerProvider;

    ({ trackFileDownloads, trackFormInteractions, trackPageViews, trackSessions } =
      getDefaultEventTrackingConfig(configParam));

    /* istanbul ignore if */
    if (!globalScope) {
      logger.error(`${name} is not compatible with a non-browser environment.`);
      return;
    }

    if (!isMeasurementIdListValid) {
      logger.error(
        `${name} received an invalid input for measurement IDs. Measurement IDs must be a string or an array of strings.`,
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
    amplitude = amplitudeParam;
    preSetupEventQueue.forEach((event) => processEvent(event));
    preSetupEventQueue = [];

    logger.log(`${name} is successfully added.`);
  };
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    // NOTE: Unable to pass an event to track() with custom library value because an internal plugin will overwrite `event.library` value.
    // Instead, since an enrichment plugin's execute function is performed at a later time. pass an event to track() with library info in `event.extra`,
    // then enrich `event.library` in this plugin's execute function.
    if (event.extra?.library === AMPLITUDE_EVENT_LIBRARY) {
      event.library = AMPLITUDE_EVENT_LIBRARY;
      delete event.extra.library;
      if (Object.keys(event.extra).length === 0) {
        delete event.extra;
      }
    }
    return event;
  };
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
