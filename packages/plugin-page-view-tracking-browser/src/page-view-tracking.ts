import {
  getPageTitle,
  replaceSensitiveString,
  BrowserConfig,
  BrowserClient,
  EnrichmentPlugin,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  ILogger,
  CampaignParser,
  getGlobalScope,
  BASE_CAMPAIGN,
  BrowserStorage,
  omitUndefined,
  getCurrentPageViewId,
  getOrCreatePageViewId,
  AMPLITUDE_EVENT_PROP_SDK_INITIALIZATION_OFFSET,
  getSdkInitializationOffset,
} from '@amplitude/analytics-core';
import { CreatePageViewTrackingPlugin, Options } from './typings/page-view-tracking';
import { PageEngagement } from './page-engagement';

export const defaultPageViewEvent = '[Amplitude] Page Viewed';
export { PAGE_VIEW_SESSION_STORAGE_KEY } from '@amplitude/analytics-core';

type PageViewSessionStorage = {
  pageViewId: string;
};

export const pageViewTrackingPlugin: CreatePageViewTrackingPlugin = (options: Options = {}) => {
  let amplitude: BrowserClient | undefined;
  const globalScope = getGlobalScope();
  let loggerProvider: ILogger | undefined = undefined;
  let isTracking = false;
  let localConfig: BrowserConfig;
  let sessionStorage: BrowserStorage<PageViewSessionStorage> | undefined;
  let engagement: PageEngagement | undefined;
  let lastPageViewId: string | undefined;
  let pendingPageRevision: number | undefined;
  let cancellationRevision = 0;
  let pageRevision = 0;
  let pageHasExited = false;
  let removePrerenderListener: (() => void) | undefined;
  let removePageLifecycleListeners: (() => void) | undefined;
  const { trackOn, trackHistoryChanges, eventType = defaultPageViewEvent } = options;

  const getDecodeURI = (locationStr: string): string => {
    let decodedLocationStr = locationStr;
    try {
      decodedLocationStr = decodeURI(locationStr);
    } catch (e) {
      /* istanbul ignore next */
      loggerProvider?.error('Malformed URI sequence: ', e);
    }

    return decodedLocationStr;
  };

  const createPageViewEvent = async (pageViewId: string | undefined): Promise<Event> => {
    // Scroll and viewport are read before the campaign await so a later change stays off this event.
    // The init offset was sampled when the plugin was installed, so this read does not move it.
    const minPageY = readMinPageY();
    const viewportWidth = readViewportWidth();
    const sdkInitializationOffset = getSdkInitializationOffset(localConfig.apiKey);
    /* istanbul ignore next */
    const locationHREF = getDecodeURI((typeof location !== 'undefined' && location.href) || '');
    // Capture the page before campaign lookup yields to a later navigation.
    const pageProperties = {
      '[Amplitude] Page Domain':
        /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
      '[Amplitude] Page Location': locationHREF,
      '[Amplitude] Page Path':
        /* istanbul ignore next */ (typeof location !== 'undefined' && getDecodeURI(location.pathname)) || '',
      '[Amplitude] Page Title': /* istanbul ignore next */ getPageTitle(replaceSensitiveString),
      '[Amplitude] Page URL': locationHREF.split('?')[0],
      '[Amplitude] Min Page Y': minPageY,
      '[Amplitude] Viewport Width': viewportWidth,
      [AMPLITUDE_EVENT_PROP_SDK_INITIALIZATION_OFFSET]: sdkInitializationOffset,
      '[Amplitude] Page View ID': pageViewId,
    };
    return {
      event_type: eventType,
      event_properties: { ...(await getCampaignParams()), ...pageProperties },
    };
  };

  const shouldTrackOnPageLoad = () => typeof trackOn === 'undefined' || (typeof trackOn === 'function' && trackOn());

  const trackNewPageView = async (client: BrowserClient) => {
    const revision = pageRevision;
    const cancellation = cancellationRevision;
    if (pageHasExited || pendingPageRevision === revision) return;
    pendingPageRevision = revision;
    const pageViewId = getOrCreatePageViewId(localConfig.apiKey, currentHref(), lastPageViewId);
    lastPageViewId = pageViewId;
    try {
      const event = await createPageViewEvent(pageViewId);
      if (isTracking && !localConfig.optOut && cancellation === cancellationRevision) {
        event.extra = { ...event.extra, pageViewContext: { revision, cancellation } };
        // Keep the guard until the event reaches execute(), not just until it is queued.
        await client.track(event).promise;
      }
    } finally {
      if (pendingPageRevision === revision) pendingPageRevision = undefined;
    }
  };

  // Navigation preserves pending views as ordinary events. Identity/session
  // boundaries still cancel them so they cannot be attributed to a later context.
  const finishPageView = (reason: string) => {
    pageRevision += 1;
    if (reason !== 'navigation') cancellationRevision += 1;
    engagement?.finish(reason);
  };

  /* istanbul ignore next */
  let previousURL: string | null = typeof location !== 'undefined' ? location.href : null;

  const trackHistoryPageView = async (): Promise<void> => {
    const newURL = location.href;
    const isNewPage = shouldTrackHistoryPageView(trackHistoryChanges, newURL, previousURL || '');
    const shouldTrackPageView = isNewPage && shouldTrackOnPageLoad();
    // Note: Update `previousURL` in the same clock tick as `shouldTrackHistoryPageView()`
    // This was previously done after `amplitude?.track(await createPageViewEvent());` and
    // causes a concurrency issue where app triggers `pushState` twice with the same URL target
    // but `previousURL` is only updated after the second `pushState` producing two page viewed events
    previousURL = newURL;

    if (engagement && isNewPage) {
      // Navigation ends engagement; pending views retain their original page.
      finishPageView('navigation');
    }
    if (shouldTrackPageView) {
      if (engagement) {
        void trackNewPageView(amplitude!);
        return;
      }
      // Generate new page view id and set it in session storage
      let pageViewId: string | undefined;
      if (sessionStorage) {
        pageViewId = getOrCreatePageViewId(localConfig.apiKey, currentHref());
      }

      /* istanbul ignore next */
      loggerProvider?.log('Tracking page view event');
      amplitude?.track(await createPageViewEvent(pageViewId));
    }
  };

  /* istanbul ignore next */
  const handlePageChange = () => {
    void trackHistoryPageView();
  };

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-page-view-tracking-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, client: BrowserClient) => {
      amplitude = client;
      localConfig = config;

      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-view-tracking-browser');

      isTracking = true;
      if (options.trackEngagedTime && trackOn === undefined && globalScope?.document) {
        // Invalidate pending creations before the engagement owner handles these events.
        const onPageHide = () => {
          pageHasExited = true;
          pageRevision += 1;
          cancellationRevision += 1;
        };
        const onPageShow = () => {
          pageHasExited = false;
        };
        globalScope.addEventListener('pagehide', onPageHide);
        globalScope.addEventListener('pageshow', onPageShow);
        removePageLifecycleListeners = () => {
          globalScope.removeEventListener('pagehide', onPageHide);
          globalScope.removeEventListener('pageshow', onPageShow);
        };
        const engagementOptions = typeof options.trackEngagedTime === 'object' ? options.trackEngagedTime : {};
        engagement = new PageEngagement(client, globalScope, engagementOptions, config, () => {
          void trackNewPageView(client);
        });
      }
      // Freeze the navigation-to-init offset now, including when the first page view is deferred.
      getSdkInitializationOffset(localConfig.apiKey);
      if (globalScope) {
        // init session storage
        try {
          sessionStorage = new BrowserStorage<PageViewSessionStorage>(globalScope.sessionStorage);
        } catch (error) {
          /* istanbul ignore next */
          loggerProvider?.debug('sessionStorage is not available in this environment.');
        }

        globalScope.addEventListener('popstate', handlePageChange);

        /* istanbul ignore next */
        // There is no global browser listener for changes to history, so we have
        // to modify pushState directly.
        // https://stackoverflow.com/a/64927639
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            target.apply(thisArg, [state, unused, url]);
            if (isTracking) {
              handlePageChange();
            }
          },
        });
      }

      if (shouldTrackOnPageLoad()) {
        // An engagement owner is only installed in a document environment.
        const doc = globalScope?.document as (Document & { prerendering?: boolean }) | undefined;
        if (doc && engagement && doc.prerendering) {
          const onActivated = () => {
            doc.removeEventListener('prerenderingchange', onActivated);
            void trackNewPageView(client);
          };
          doc.addEventListener('prerenderingchange', onActivated);
          removePrerenderListener = () => doc.removeEventListener('prerenderingchange', onActivated);
          return;
        }
        if (engagement) {
          void trackNewPageView(client);
          return;
        }
        loggerProvider.log('Tracking page view event');
        // Reuse the id already minted for this project and URL, if another SDK instance
        // initialized first. Otherwise mint one and publish it for autocapture.
        let pageViewId: string | undefined;

        if (sessionStorage) {
          pageViewId = getOrCreatePageViewId(localConfig.apiKey, currentHref());
        }

        amplitude.track(await createPageViewEvent(pageViewId));
      }
    },

    execute: async (event: Event) => {
      // A heartbeat reuses the enriched original page view, including its counter.
      if (engagement && event.delay) return event;
      if (trackOn === 'attribution' && isCampaignEvent(event)) {
        /* istanbul ignore next */ // loggerProvider should be defined by the time execute is invoked
        loggerProvider?.log('Enriching campaign event to page view event with campaign parameters');
        // Retrieve the current page view id. Do not mint a new one for attribution.
        let pageViewId: string | undefined;
        if (sessionStorage) {
          pageViewId = getCurrentPageViewId(localConfig.apiKey);
        }

        const pageViewEvent = await createPageViewEvent(pageViewId);
        event.event_type = pageViewEvent.event_type;
        event.event_properties = {
          ...event.event_properties,
          ...pageViewEvent.event_properties,
        };
      }

      // Update the pageCounter for the page view event
      if (localConfig && event.event_type === eventType) {
        const context = event.extra?.pageViewContext as { revision: number; cancellation: number } | undefined;
        if (engagement && (pageHasExited || (context && context.cancellation !== cancellationRevision))) return null;
        localConfig.pageCounter = !localConfig.pageCounter ? 1 : localConfig.pageCounter + 1;
        event.event_properties = {
          ...event.event_properties,
          '[Amplitude] Page Counter': localConfig.pageCounter,
        };
        if (engagement) {
          if (localConfig.optOut) return null;
          // The page view still happened, but its page has already ended.
          // Send it normally without starting or replacing the current engagement.
          if (context && context.revision !== pageRevision) return event;
          // Delayed page views must never replay user-property updates. Use identify separately.
          delete event.user_properties;
          // Suppress the original only after the heartbeat accepts its snapshot.
          return engagement.start(event) ? null : event;
        }
      }
      return event;
    },

    teardown: async () => {
      pageRevision += 1;
      cancellationRevision += 1;
      engagement?.teardown();
      removePrerenderListener?.();
      removePageLifecycleListeners?.();
      if (globalScope) {
        globalScope.removeEventListener('popstate', handlePageChange);
        isTracking = false;
      }
    },
    onOptOutChanged: async (optOut) => {
      if (optOut) {
        pageRevision += 1;
        cancellationRevision += 1;
      }
      engagement?.setOptOut(optOut);
    },
    onReset: async () => finishPageView('reset'),
    onIdentityChanged: async (identity) => {
      if ('userId' in identity || 'deviceId' in identity) finishPageView('identity_change');
    },
    onSessionIdChanged: async () => finishPageView('session_change'),
  };
  return plugin;
};

/* istanbul ignore next */
const currentHref = (): string => (typeof location !== 'undefined' && location.href) || '';

/** Top of the viewport (`scrollY`) when the page view event is created. */
const readMinPageY = (): number => {
  const scope = getGlobalScope();
  if (!scope) {
    return 0;
  }
  const offset = scope.scrollY ?? scope.pageYOffset ?? 0;
  return Math.floor(offset);
};

/** `window.innerWidth` when the page view event is created. Same property as other autocapture events. */
const readViewportWidth = (): number => {
  const scope = getGlobalScope();
  if (!scope) {
    return 0;
  }
  return scope.innerWidth ?? 0;
};

const getCampaignParams = async () => omitUndefined(await new CampaignParser().parse());

const isCampaignEvent = (event: Event) => {
  if (event.event_type === '$identify' && event.user_properties) {
    const properties = event.user_properties as IdentifyUserProperties;
    const $set = properties[IdentifyOperation.SET] || {};
    const $unset = properties[IdentifyOperation.UNSET] || {};
    const userProperties = [...Object.keys($set), ...Object.keys($unset)];
    return Object.keys(BASE_CAMPAIGN).every((value) => userProperties.includes(value));
  }
  return false;
};

export const shouldTrackHistoryPageView = (
  trackingOption: Options['trackHistoryChanges'],
  newURLStr: string,
  oldURLStr: string,
): boolean => {
  switch (trackingOption) {
    case 'pathOnly': {
      if (oldURLStr == '') return true;
      const newURL = new URL(newURLStr);
      const oldURL = new URL(oldURLStr);
      const newBaseStr = newURL.origin + newURL.pathname;
      const oldBaseStr = oldURL.origin + oldURL.pathname;
      return newBaseStr !== oldBaseStr;
    }
    default:
      return newURLStr !== oldURLStr;
  }
};
