/* eslint-disable no-restricted-globals */
import {
  type BrowserClient,
  type BrowserConfig,
  type EnrichmentPlugin,
  type ElementInteractionsOptions,
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
import { createClickObservableZen, createMutationObservableZen } from './observables';

import {
  createLabeledEventToTriggerMap,
  createTriggerEvaluator,
  groupLabeledEventIdsByEventType,
} from './pageActions/triggers';
import { DataExtractor } from './data-extractor';
import { Observable as ZenObservable, Unsubscribable } from '@amplitude/analytics-core';

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
  ClickObservableZen = 'clickObservableZen',
  ChangeObservable = 'changeObservable',
  // ErrorObservable = 'errorObservable',
  NavigateObservable = 'navigateObservable',
  MutationObservable = 'mutationObservable',
  MutationObservableZen = 'mutationObservableZen',
  NavigateObservableZen = 'navigateObservableZen',
}

export interface AllWindowObservables {
  [ObservablesEnum.ChangeObservable]: ZenObservable<ElementBasedTimestampedEvent<Event>>;
  // [ObservablesEnum.ErrorObservable]: Observable<TimestampedEvent<ErrorEvent>>;
  [ObservablesEnum.ClickObservableZen]?: ZenObservable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.MutationObservableZen]?: ZenObservable<TimestampedEvent<MutationRecord[]>>;
  [ObservablesEnum.NavigateObservableZen]?: ZenObservable<TimestampedEvent<NavigateEvent>>;
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

  // Create data extractor based on options
  const dataExtractor = new DataExtractor(options, context);

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    const clickObservableZen = multicast(
      createClickObservableZen().map(
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
      new ZenObservable<ElementBasedTimestampedEvent<Event>>((observer) => {
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

    // Create Observable from unhandled errors
    // const errorObservable = fromEvent<ErrorEvent>(window, 'error').pipe(
    //   map((error) => addAdditionalEventProperties(error, 'error')),
    // );

    // Create observable for URL changes
    let navigateObservableZen: ZenObservable<TimestampedEvent<NavigateEvent>> | undefined;

    /* istanbul ignore next */
    if (window.navigation) {
      navigateObservableZen = multicast(
        new ZenObservable<TimestampedEvent<NavigateEvent>>((observer) => {
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

    const mutationObservableZen = multicast(
      createMutationObservableZen().map((mutation) =>
        dataExtractor.addAdditionalEventProperties(
          mutation,
          'mutation',
          (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
          dataAttributePrefix,
        ),
      ),
    );

    return {
      [ObservablesEnum.ChangeObservable]: changeObservable,
      // [ObservablesEnum.ErrorObservable]: errorObservable,
      [ObservablesEnum.ClickObservableZen]: clickObservableZen,
      [ObservablesEnum.MutationObservableZen]: mutationObservableZen,
      [ObservablesEnum.NavigateObservableZen]: navigateObservableZen,
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
      options: options as AutoCaptureOptionsWithDefaults,
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
      evaluateTriggers: evaluateTriggers.evaluate.bind(evaluateTriggers),
    });

    if (clickTrackingSubscription) {
      subscriptions.push(clickTrackingSubscription);
    }

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
