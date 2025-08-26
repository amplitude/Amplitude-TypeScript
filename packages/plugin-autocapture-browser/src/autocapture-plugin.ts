/* eslint-disable no-restricted-globals */
import {
  type BrowserClient,
  type BrowserConfig,
  type EnrichmentPlugin,
  type ElementInteractionsOptions,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
} from '@amplitude/analytics-core';
import { createRemoteConfigFetch } from '@amplitude/analytics-remote-config';
import * as constants from './constants';
import { fromEvent, map, type Observable, type Subscription, share } from 'rxjs';
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
import type { HasEventTargetAddRemove } from 'rxjs/internal/observable/fromEvent';
import { createMutationObservable, createClickObservable } from './observables';

import {
  createLabeledEventToTriggerMap,
  createTriggerEvaluator,
  groupLabeledEventIdsByEventType,
} from './pageActions/triggers';
import { DataExtractor } from './data-extractor';

declare global {
  interface Window {
    navigation: HasEventTargetAddRemove<Event>;
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
  // ErrorObservable = 'errorObservable',
  NavigateObservable = 'navigateObservable',
  MutationObservable = 'mutationObservable',
}

export interface AllWindowObservables {
  [ObservablesEnum.ClickObservable]: Observable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.ChangeObservable]: Observable<ElementBasedTimestampedEvent<Event>>;
  // [ObservablesEnum.ErrorObservable]: Observable<TimestampedEvent<ErrorEvent>>;
  [ObservablesEnum.NavigateObservable]: Observable<TimestampedEvent<NavigateEvent>> | undefined;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
}

export const autocapturePlugin = (options: ElementInteractionsOptions = {}): BrowserEnrichmentPlugin => {
  const {
    dataAttributePrefix = DEFAULT_DATA_ATTRIBUTE_PREFIX,
    visualTaggingOptions = {
      enabled: true,
      messenger: new WindowMessenger(),
    },
  } = options;

  options.cssSelectorAllowlist = options.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST;
  options.actionClickAllowlist = options.actionClickAllowlist ?? DEFAULT_ACTION_CLICK_ALLOWLIST;
  options.debounceTime = options.debounceTime ?? 0; // TODO: update this when rage clicks are added to 1000ms

  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Subscription[] = [];

  // Create data extractor based on options
  const dataExtractor = new DataExtractor(options);

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = createClickObservable().pipe(
      map((click) =>
        dataExtractor.addAdditionalEventProperties(
          click,
          'click',
          (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
          dataAttributePrefix,
        ),
      ),
      share(),
    );
    const changeObservable = fromEvent<Event>(document, 'change', { capture: true }).pipe(
      map((change) =>
        dataExtractor.addAdditionalEventProperties(
          change,
          'change',
          (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
          dataAttributePrefix,
        ),
      ),
      share(),
    );

    // Create Observable from unhandled errors
    // const errorObservable = fromEvent<ErrorEvent>(window, 'error').pipe(
    //   map((error) => addAdditionalEventProperties(error, 'error')),
    // );

    // Create observable for URL changes
    let navigateObservable: Observable<TimestampedEvent<NavigateEvent>> | undefined;
    /* istanbul ignore next */
    if (window.navigation) {
      navigateObservable = fromEvent<NavigateEvent>(window.navigation, 'navigate').pipe(
        map((navigate) =>
          dataExtractor.addAdditionalEventProperties(
            navigate,
            'navigate',
            (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
            dataAttributePrefix,
          ),
        ),
        share(),
      );
    }

    // Track DOM Mutations using shared observable
    const mutationObservable = createMutationObservable().pipe(
      map((mutation) =>
        dataExtractor.addAdditionalEventProperties(
          mutation,
          'mutation',
          (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
          dataAttributePrefix,
        ),
      ),
      share(),
    );

    return {
      [ObservablesEnum.ClickObservable]: clickObservable as Observable<ElementBasedTimestampedEvent<MouseEvent>>,
      [ObservablesEnum.ChangeObservable]: changeObservable as Observable<ElementBasedTimestampedEvent<Event>>,
      // [ObservablesEnum.ErrorObservable]: errorObservable,
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
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
      createRemoteConfigFetch({
        localConfig: config,
        configKeys: ['analyticsSDK.pageActions'],
      })
        .then(async (remoteConfigFetch) => {
          try {
            const remotePageActions = await remoteConfigFetch.getRemoteConfig('analyticsSDK', 'pageActions');
            recomputePageActionsData(remotePageActions as ElementInteractionsOptions['pageActions']);
          } catch (error) {
            // Log error but don't fail the setup
            /* istanbul ignore next */
            config?.loggerProvider?.error(`Failed to fetch remote config: ${String(error)}`);
          }
        })
        .catch((error) => {
          // Log error but don't fail the setup
          /* istanbul ignore next */
          config?.loggerProvider?.error(`Failed to create remote config fetch: ${String(error)}`);
        });
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
    subscriptions.push(actionClickSubscription);

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
