/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  ElementInteractionsOptions,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
  DEFAULT_ACTION_CLICK_ALLOWLIST,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { fromEvent, map, Observable, Subscription, share } from 'rxjs';
import {
  addAdditionalEventProperties,
  createShouldTrackEvent,
  getEventProperties,
  ElementBasedTimestampedEvent,
  TimestampedEvent,
  ElementBasedEvent,
  NavigateEvent,
} from './helpers';
import { WindowMessenger } from './libs/messenger';
import { trackClicks } from './autocapture/track-click';
import { trackChange } from './autocapture/track-change';
import { trackActionClick } from './autocapture/track-action-click';
import { HasEventTargetAddRemove } from 'rxjs/internal/observable/fromEvent';
import { createMutationObservable, createClickObservable } from './observables';

import {
  createLabeledEventToTriggerMap,
  groupLabeledEventIdsByEventType,
  matchEventToLabeledEvents,
  matchLabeledEventsToTriggers,
} from './pageActions/triggers';
import { executeActions } from './pageActions/actions';

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

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = createClickObservable().pipe(
      map((click) =>
        addAdditionalEventProperties(
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
        addAdditionalEventProperties(
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
    let navigateObservable;
    /* istanbul ignore next */
    if (window.navigation) {
      navigateObservable = fromEvent<NavigateEvent>(window.navigation, 'navigate').pipe(
        map((navigate) =>
          addAdditionalEventProperties(
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
        addAdditionalEventProperties(
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
  const groupedLabeledEvents = groupLabeledEventIdsByEventType(Object.values(options.pageActions?.labeledEvents ?? {}));

  const labeledEventToTriggerMap = createLabeledEventToTriggerMap(options.pageActions?.triggers ?? []);

  // Evaluate triggers for the given event by running the actions associated with the matching triggers
  const evaluateTriggers = <T extends ElementBasedEvent>(
    event: ElementBasedTimestampedEvent<T>,
  ): ElementBasedTimestampedEvent<T> => {
    // If there is no pageActions, return the event as is
    const { pageActions } = options;
    if (!pageActions) {
      return event;
    }

    // Find matching labeled events
    const matchingLabeledEvents = matchEventToLabeledEvents(
      event,
      Array.from(groupedLabeledEvents[event.type]).map((id) => pageActions.labeledEvents[id]),
    );
    // Find matching conditions
    const matchingTriggers = matchLabeledEventsToTriggers(matchingLabeledEvents, labeledEventToTriggerMap);
    for (const trigger of matchingTriggers) {
      executeActions(trigger.actions, event);
    }

    return event;
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
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
      evaluateTriggers,
    });
    subscriptions.push(clickTrackingSubscription);

    const changeSubscription = trackChange({
      allObservables,
      getEventProperties: (...args) => getEventProperties(...args, dataAttributePrefix),
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
      evaluateTriggers,
    });
    subscriptions.push(changeSubscription);

    const actionClickSubscription = trackActionClick({
      allObservables,
      options: options as AutoCaptureOptionsWithDefaults,
      getEventProperties: (...args) => getEventProperties(...args, dataAttributePrefix),
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
