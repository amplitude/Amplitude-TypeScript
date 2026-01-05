/* eslint-disable no-restricted-globals */
import {
  type BrowserClient,
  type BrowserConfig,
  type EnrichmentPlugin,
  type ElementInteractionsOptions,
  DEFAULT_EXPOSURE_DURATION,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  IDiagnosticsClient,
  getGlobalScope,
  multicast,
} from '@amplitude/analytics-core';
import { VERSION } from './version';
import * as constants from './constants';
import {
  createShouldTrackEvent,
  type ElementBasedTimestampedEvent,
  type TimestampedEvent,
  type NavigateEvent,
} from './helpers';
import { WindowMessenger } from './libs/messenger';
import { trackClicks } from './autocapture/track-click';
import { trackChange } from './autocapture/track-change';
import { trackActionClick } from './autocapture/track-action-click';
import { trackScroll } from './autocapture/track-scroll';

import {
  createClickObservable,
  createScrollObservable,
  createExposureObservable,
  createMutationObservable,
} from './observables';

import {
  createLabeledEventToTriggerMap,
  createTriggerEvaluator,
  groupLabeledEventIdsByEventType,
} from './pageActions/triggers';
import { DataExtractor } from './data-extractor';
import { Observable, Unsubscribable } from '@amplitude/analytics-core';
import { trackExposure } from './autocapture/track-exposure';
import { fireViewportContentUpdated, onExposure, ExposureTracker } from './autocapture/track-viewport-content-updated';

type NavigationType = {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

declare global {
  interface Window {
    navigation: NavigationType;
  }
}

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<ElementInteractionsOptions, 'debounceTime' | 'cssSelectorAllowlist' | 'actionClickAllowlist'>
> &
  ElementInteractionsOptions;

export enum ObservablesEnum {
  ClickObservable = 'clickObservable',
  ChangeObservable = 'changeObservable',
  NavigateObservable = 'navigateObservable',
  MutationObservable = 'mutationObservable',
  ScrollObservable = 'scrollObservable',
  ExposureObservable = 'exposureObservable',
}

export interface AllWindowObservables {
  [ObservablesEnum.ChangeObservable]: Observable<ElementBasedTimestampedEvent<Event>>;
  // [ObservablesEnum.ErrorObservable]: Observable<TimestampedEvent<ErrorEvent>>;
  [ObservablesEnum.ClickObservable]: Observable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
  [ObservablesEnum.NavigateObservable]?: Observable<TimestampedEvent<NavigateEvent>>;
  [ObservablesEnum.ScrollObservable]: Observable<Event>; // TODO: add type for scroll event
  [ObservablesEnum.ExposureObservable]: Observable<Event>;
}

export const autocapturePlugin = (
  options: ElementInteractionsOptions = {},
  context?: { diagnosticsClient: IDiagnosticsClient },
): BrowserEnrichmentPlugin => {
  // Set the plugin version tag
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  context?.diagnosticsClient.setTag('plugin.autocapture.version', VERSION);

  const {
    dataAttributePrefix = DEFAULT_DATA_ATTRIBUTE_PREFIX,
    visualTaggingOptions = {
      enabled: true,
      messenger: new WindowMessenger(),
    },
  } = options;

  options.cssSelectorAllowlist = options.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST;
  options.actionClickAllowlist = options.actionClickAllowlist ?? DEFAULT_ACTION_CLICK_ALLOWLIST;
  options.debounceTime = options.debounceTime ?? 0;
  options.exposureDuration = options.exposureDuration ?? DEFAULT_EXPOSURE_DURATION;

  options.pageUrlExcludelist = options.pageUrlExcludelist?.reduce(
    (acc: (string | RegExp | { pattern: string })[], excludePattern) => {
      if (typeof excludePattern === 'string') {
        acc.push(excludePattern);
      }
      if (excludePattern instanceof RegExp) {
        acc.push(excludePattern);
      }
      if (typeof excludePattern === 'object' && excludePattern !== null && 'pattern' in excludePattern) {
        try {
          acc.push(new RegExp(excludePattern.pattern));
        } catch (regexError) {
          console.warn(`Invalid regex pattern: ${excludePattern.pattern}`, regexError);
          return acc;
        }
      }
      return acc;
    },
    [],
  );

  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Unsubscribable[] = [];

  const dataExtractor = new DataExtractor(options, context);

  // Page-level state shared across trackers, emitted in a single Page View End event on beforeunload
  // elementExposedForPage holds the total set of elements seen during the entire page view lifetime
  const elementExposedForPage = new Set<string>();
  // currentElementExposed only holds the set of elements that will be flushed during the next [Amplitude] Viewport Content Updated event
  const currentElementExposed = new Set<string>();

  let beforeUnloadCleanup: () => void;

  const createObservables = (): AllWindowObservables => {
    const clickObservable = multicast(
      createClickObservable().map(
        (click) =>
          dataExtractor.addAdditionalEventProperties(
            click,
            'click',
            (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
            dataAttributePrefix,
          ) as ElementBasedTimestampedEvent<MouseEvent>,
      ),
    );

    const changeObservable = multicast(
      new Observable<ElementBasedTimestampedEvent<Event>>((observer) => {
        const handler = (changeEvent: Event) => {
          const enrichedChangeEvent = dataExtractor.addAdditionalEventProperties(
            changeEvent,
            'change',
            (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
            dataAttributePrefix,
          ) as ElementBasedTimestampedEvent<Event>;
          observer.next(enrichedChangeEvent);
        };
        /* istanbul ignore next */
        getGlobalScope()?.document.addEventListener('change', handler, { capture: true });
        /* istanbul ignore next */
        return () => getGlobalScope()?.document.removeEventListener('change', handler);
      }),
    );

    // Create observable for URL changes
    let navigateObservable: Observable<TimestampedEvent<NavigateEvent>> | undefined;

    /* istanbul ignore next */
    if (window.navigation) {
      navigateObservable = multicast(
        new Observable<TimestampedEvent<NavigateEvent>>((observer) => {
          const handler = (navigateEvent: NavigateEvent) => {
            const enrichedNavigateEvent = dataExtractor.addAdditionalEventProperties(
              navigateEvent,
              'navigate',
              (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
              dataAttributePrefix,
            );
            observer.next(enrichedNavigateEvent);
          };
          window.navigation.addEventListener('navigate', handler as EventListener);
          return () => {
            window.navigation.removeEventListener('navigate', handler as EventListener);
          };
        }),
      );
    }

    const mutationObservable = multicast(
      createMutationObservable().map((mutation) =>
        dataExtractor.addAdditionalEventProperties(
          mutation,
          'mutation',
          (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
          dataAttributePrefix,
        ),
      ),
    );

    const scrollObservable = createScrollObservable();

    const exposureObservable = createExposureObservable(
      mutationObservable,
      (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
    );

    return {
      [ObservablesEnum.ChangeObservable]: changeObservable,
      // [ObservablesEnum.ErrorObservable]: errorObservable,
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.ScrollObservable]: scrollObservable,
      [ObservablesEnum.ExposureObservable]: exposureObservable,
    };
  };

  // Group labeled events by event type (eg. click, change)
  let groupedLabeledEvents = groupLabeledEventIdsByEventType(Object.values(options.pageActions?.labeledEvents ?? {}));

  let labeledEventToTriggerMap = createLabeledEventToTriggerMap(options.pageActions?.triggers ?? []);

  // Evaluate triggers for the given event by running the actions associated with the matching triggers
  const evaluateTriggers = createTriggerEvaluator(
    groupedLabeledEvents,
    labeledEventToTriggerMap,
    dataExtractor,
    options,
  );

  // Function to recalculate internal variables when remote config is updated
  const recomputePageActionsData = (remotePageActions: ElementInteractionsOptions['pageActions']) => {
    if (remotePageActions) {
      // Merge remote config with local options
      options.pageActions = {
        ...options.pageActions,
        ...remotePageActions,
      };

      // Recalculate internal variables
      groupedLabeledEvents = groupLabeledEventIdsByEventType(Object.values(options.pageActions.labeledEvents ?? {}));
      labeledEventToTriggerMap = createLabeledEventToTriggerMap(options.pageActions.triggers ?? []);

      // Update evaluateTriggers function
      evaluateTriggers.update(groupedLabeledEvents, labeledEventToTriggerMap, options);
    }
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    let pageViewEndFired = false;
    const lastScroll: { maxX: undefined | number; maxY: undefined | number } = { maxX: undefined, maxY: undefined };

    // Fetch remote config for pageActions in a non-blocking manner
    if (config.fetchRemoteConfig) {
      if (!config.remoteConfigClient) {
        // TODO(xinyi): Diagnostics.recordEvent
        config.loggerProvider.debug('Remote config client is not provided, skipping remote config fetch');
      } else {
        config.remoteConfigClient.subscribe('analyticsSDK.pageActions', 'all', (remoteConfig) => {
          recomputePageActionsData(remoteConfig as ElementInteractionsOptions['pageActions']);
        });
      }
    }

    // Create should track event functions the different allowlists
    const shouldTrackEvent = createShouldTrackEvent(
      options,
      (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
    );
    const shouldTrackActionClick = createShouldTrackEvent(
      options,
      (options as AutoCaptureOptionsWithDefaults).actionClickAllowlist,
    );

    // Create observables for events on the window
    const allObservables = createObservables();

    // Create subscriptions
    const clickTrackingSubscription = trackClicks({
      allObservables,
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
      evaluateTriggers: evaluateTriggers.evaluate.bind(evaluateTriggers),
    });

    subscriptions.push(clickTrackingSubscription);

    const changeSubscription = trackChange({
      allObservables,
      getEventProperties: (...args) => dataExtractor.getEventProperties(...args, dataAttributePrefix),
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
      evaluateTriggers: evaluateTriggers.evaluate.bind(evaluateTriggers),
    });
    subscriptions.push(changeSubscription);

    const actionClickSubscription = trackActionClick({
      allObservables,
      options: options as AutoCaptureOptionsWithDefaults,
      getEventProperties: (...args) => dataExtractor.getEventProperties(...args, dataAttributePrefix),
      amplitude,
      shouldTrackEvent,
      shouldTrackActionClick: shouldTrackActionClick,
    });
    if (actionClickSubscription) {
      subscriptions.push(actionClickSubscription);
    }

    const scrollTracker = trackScroll({
      allObservables,
      amplitude,
    });
    subscriptions.push(scrollTracker);

    const trackers: { exposure?: ExposureTracker & Unsubscribable } = {};

    const globalScope = getGlobalScope();

    const handleViewportContentUpdated = (isPageEnd: boolean) => {
      if (isPageEnd && pageViewEndFired) {
        return;
      }
      setTimeout(() => {
        pageViewEndFired = false;
      }, 100);

      pageViewEndFired = true;
      fireViewportContentUpdated({
        amplitude,
        scrollTracker,
        currentElementExposed,
        elementExposedForPage,
        exposureTracker: trackers.exposure,
        isPageEnd,
        lastScroll,
      });
    };

    const handleExposure = (elementPath: string) => {
      onExposure(elementPath, elementExposedForPage, currentElementExposed, handleViewportContentUpdated);
    };

    trackers.exposure = trackExposure({
      allObservables,
      onExposure: handleExposure,
      dataExtractor,
      exposureDuration: options.exposureDuration,
    });
    if (trackers.exposure) {
      subscriptions.push(trackers.exposure);
    }

    const beforeUnloadHandler = () => {
      console.log('amp: beforeUnload');
      handleViewportContentUpdated(true);
    };
    /* istanbul ignore next */
    globalScope?.addEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadCleanup = () => {
      /* istanbul ignore next */
      globalScope?.removeEventListener('beforeunload', beforeUnloadHandler);
    };
    // Ensure cleanup on teardown as well
    subscriptions.push({ unsubscribe: () => beforeUnloadCleanup() });

    // Also track on navigation (SPA)
    const navigateObservable = allObservables[ObservablesEnum.NavigateObservable];
    if (navigateObservable) {
      subscriptions.push(
        navigateObservable.subscribe(() => {
          console.log('amp: navigate');
          handleViewportContentUpdated(true);
        }),
      );
    } else if (globalScope) {
      const popstateHandler = () => {
        console.log('amp: popstate');
        handleViewportContentUpdated(true);
      };
      /* istanbul ignore next */
      // Fallback for SPA tracking when Navigation API is not available
      globalScope.addEventListener('popstate', popstateHandler);

      /* istanbul ignore next */
      // There is no global browser listener for changes to history, so we have
      // to modify pushState directly.
      // https://stackoverflow.com/a/64927639
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalPushState = globalScope.history.pushState;
      if (globalScope.history && originalPushState) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(originalPushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            console.log('amp: pushState');
            target.apply(thisArg, [state, unused, url]);
            handleViewportContentUpdated(true);
          },
        });
      }

      subscriptions.push({
        unsubscribe: () => {
          /* istanbul ignore next */
          globalScope.removeEventListener('popstate', popstateHandler);
          /* istanbul ignore next */
          if (globalScope.history && originalPushState) {
            globalScope.history.pushState = originalPushState;
          }
        },
      });
    }

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);

    // Setup visual tagging selector
    if (window.opener && visualTaggingOptions.enabled) {
      const allowlist = (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist;
      const actionClickAllowlist = (options as AutoCaptureOptionsWithDefaults).actionClickAllowlist;

      /* istanbul ignore next */
      visualTaggingOptions.messenger?.setup({
        dataExtractor: dataExtractor,
        logger: config?.loggerProvider,
        ...(config?.serverZone && { endpoint: constants.AMPLITUDE_ORIGINS_MAP[config.serverZone] }),
        isElementSelectable: createShouldTrackEvent(options, [...allowlist, ...actionClickAllowlist]),
        cssSelectorAllowlist: allowlist,
        actionClickAllowlist: actionClickAllowlist,
      });
    }
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
