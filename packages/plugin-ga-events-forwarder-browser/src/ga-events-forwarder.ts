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
type FetchFn = typeof fetch;
type FetchInterceptor = (...args: Parameters<FetchFn>) => void;

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
  let fetch: undefined | FetchFn;
  let trackFileDownloads = false;
  let trackFormInteractions = false;
  let trackPageViews = false;
  let trackSessions = false;
  let lastSeenGAUserId: string | undefined = undefined;

  /**
   * Creates proxy for `navigator.sendBeacon` immediately to start listening for events.
   * Google Analytics may start sending events before Amplitude SDK is initialized.
   */
  if (globalScope && isMeasurementIdListValid) {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    sendBeacon = globalScope.navigator.sendBeacon;
    fetch = globalScope.fetch;

    // eslint-disable-next-line @typescript-eslint/unbound-method
    globalScope.navigator.sendBeacon = new Proxy(globalScope.navigator.sendBeacon, {
      apply: (target: SendBeaconFn, thisArg: any, argArray: Parameters<SendBeaconFn>) => {
        // Intercepts request and attempt to send to Amplitude
        interceptBeacon.apply(thisArg, argArray);
        // Execute sendBeacon
        return target.apply(thisArg, argArray);
      },
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    globalScope.fetch = new Proxy(globalScope.fetch, {
      apply: (target: FetchFn, thisArg: any, argArray: Parameters<FetchFn>) => {
        // Intercepts request and attempt to send to Amplitude
        interceptFetch.apply(thisArg, argArray);
        // Execute fetch
        return target.apply(thisArg, argArray);
      },
    });
  }

  const interceptBeacon: SendBeaconFn = (requestUrl, data) => {
    return intercept(requestUrl, data);
  };

  const interceptFetch: FetchInterceptor = (resource, options) => {
    let requestUrl: string | URL = '';

    // Fetch accepts strings, objects with stringifiers, or request objects
    try {
      /* istanbul ignore next */
      if (globalScope?.Request && resource instanceof globalScope.Request) {
        requestUrl = resource.url;
      } else if (typeof resource === 'string') {
        requestUrl = resource;
      } else if ('toString' in resource && typeof resource.toString === 'function') {
        requestUrl = resource.toString();
      }
    } catch (e) {
      /* istanbul ignore next */
      logger?.error(e);
    }

    intercept(requestUrl, options?.body);
  };

  /**
   * 1. Parses the event payload of requests to GA4
   * 2. Transforms GA4 events to Amplitude Events
   * 3a: Pushes to preSetupEventQueue while waiting for Amplitude SDK to initialize
   * 3b. Sends events to Amplitude after Amplitude SDK is initialized
   */
  const intercept = (requestUrl: string | URL, data: BodyInit | null | undefined): boolean => {
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
    } catch (e) {
      /* istanbul ignore next */
      logger?.error(e);
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

    // Sets a new user ID in Amplitude SDK when customer sets a new user ID in using Google Analytics SDK mid-session.
    const userId = event.user_id;
    // 1. Ignore user ID received from a Google Analytics event. This allows the Amplitude SDK to enrich the user ID field later.
    delete event.user_id;
    // 2. If current event's user ID is different from the previous event's user ID
    // The current event's user ID can be different from the previous event's user ID when a new user_id is set through Google Analytics, for example:
    // gtag('config', 'TAG_ID', {
    //   'user_id': 'USER_ID'
    // });
    if (userId !== lastSeenGAUserId) {
      // 2a. Set current event's user ID as Amplitude SDK's current user ID.
      amplitude.setUserId(userId);
      // 2b. Update last seen GA user ID to be used on the next iteration.
      lastSeenGAUserId = userId;
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
    }

    if (globalScope && fetch) {
      globalScope.fetch = fetch;
    }

    /* istanbul ignore next */
    logger?.log(`${name} is removed.`);

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
