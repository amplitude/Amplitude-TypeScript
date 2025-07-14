/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  FrustrationInteractionsOptions,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { fromEvent, map, Observable, Subscription, share } from 'rxjs';
import {
  addAdditionalEventProperties,
  createShouldTrackEvent,
  ElementBasedTimestampedEvent,
  getEventProperties,
  NavigateEvent,
} from './helpers';
import { trackDeadClick } from './autocapture/track-dead-click';
import { trackRageClicks } from './autocapture/track-rage-click';
import { AllWindowObservables, ObservablesEnum } from './autocapture-plugin';
import { createClickObservable, createMutationObservable } from './observables';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const frustrationPlugin = (options: FrustrationInteractionsOptions): BrowserEnrichmentPlugin => {
  const name = constants.FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Subscription[] = [];

  const rageCssSelectors = options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_RAGE_CLICK_ALLOWLIST;
  const deadCssSelectors = options.deadClicks?.cssSelectorAllowlist ?? DEFAULT_DEAD_CLICK_ALLOWLIST;

  const dataAttributePrefix = options.dataAttributePrefix ?? DEFAULT_DATA_ATTRIBUTE_PREFIX;

  // combine the two selector lists to determine which clicked elements should be filtered
  const combinedCssSelectors = [...new Set([...rageCssSelectors, ...deadCssSelectors])];

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = createClickObservable().pipe(
      map((click) => {
        return addAdditionalEventProperties(
          click,
          'click',
          combinedCssSelectors,
          dataAttributePrefix,
          true, // capture when cursor is pointer
        );
      }),
      share(),
    );

    // Create observable for URL changes
    let navigateObservable;
    /* istanbul ignore next */
    if (window.navigation) {
      navigateObservable = fromEvent<NavigateEvent>(window.navigation, 'navigate').pipe(
        map((navigate) =>
          addAdditionalEventProperties(navigate, 'navigate', combinedCssSelectors, dataAttributePrefix),
        ),
        share(),
      );
    }

    // Track DOM Mutations
    const enrichedMutationObservable = createMutationObservable().pipe(
      map((mutation) => addAdditionalEventProperties(mutation, 'mutation', combinedCssSelectors, dataAttributePrefix)),
      share(),
    );

    return {
      [ObservablesEnum.ClickObservable]: clickObservable as Observable<ElementBasedTimestampedEvent<MouseEvent>>,
      [ObservablesEnum.ChangeObservable]: new Observable<ElementBasedTimestampedEvent<Event>>(), // Empty observable since we don't need change events
      [ObservablesEnum.NavigateObservable]: navigateObservable,
      [ObservablesEnum.MutationObservable]: enrichedMutationObservable,
    };
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    // Create should track event functions for the different allowlists
    const shouldTrackRageClick = createShouldTrackEvent(options, rageCssSelectors);
    const shouldTrackDeadClick = createShouldTrackEvent(options, deadCssSelectors);

    // Create observables for events on the window
    const allObservables = createObservables();

    // Create subscriptions
    const rageClickSubscription = trackRageClicks({
      allObservables,
      amplitude,
      shouldTrackRageClick,
    });
    subscriptions.push(rageClickSubscription);

    const deadClickSubscription = trackDeadClick({
      amplitude,
      allObservables,
      getEventProperties: (actionType, element) => getEventProperties(actionType, element, dataAttributePrefix),
      shouldTrackDeadClick,
    });
    subscriptions.push(deadClickSubscription);

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);
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
