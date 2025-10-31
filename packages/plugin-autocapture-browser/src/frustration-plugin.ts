/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  FrustrationInteractionsOptions,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
  multicast,
  Observable,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { createShouldTrackEvent, ElementBasedTimestampedEvent, NavigateEvent, TimestampedEvent } from './helpers';
import { trackDeadClick } from './autocapture/track-dead-click';
import { trackRageClicks } from './autocapture/track-rage-click';
import { ObservablesEnum } from './autocapture-plugin';
import { createClickObservableZen, createMutationObservableZen } from './observables';
import { DataExtractor } from './data-extractor';

export interface AllWindowObservables {
  [ObservablesEnum.ClickObservable]: Observable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
  [ObservablesEnum.NavigateObservable]?: Observable<TimestampedEvent<NavigateEvent>>;
}

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

type Unsubscribable = {
  unsubscribe: () => void;
};

export const frustrationPlugin = (options: FrustrationInteractionsOptions = {}): BrowserEnrichmentPlugin => {
  const name = constants.FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: (Unsubscribable | undefined)[] = [];

  const rageCssSelectors = options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_RAGE_CLICK_ALLOWLIST;
  const deadCssSelectors = options.deadClicks?.cssSelectorAllowlist ?? DEFAULT_DEAD_CLICK_ALLOWLIST;

  const dataAttributePrefix = options.dataAttributePrefix ?? DEFAULT_DATA_ATTRIBUTE_PREFIX;

  const dataExtractor = new DataExtractor(options);

  // combine the two selector lists to determine which clicked elements should be filtered
  const combinedCssSelectors = [...new Set([...rageCssSelectors, ...deadCssSelectors])];

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    const clickObservable = multicast(
      createClickObservableZen('pointerdown').map((click) => {
        return dataExtractor.addAdditionalEventProperties(
          click,
          'click',
          combinedCssSelectors,
          dataAttributePrefix,
          true, // capture when cursor is pointer
        );
      }),
    );

    const enrichedMutationObservable = multicast<TimestampedEvent<MutationRecord[]>>(
      createMutationObservableZen().map((mutation) =>
        dataExtractor.addAdditionalEventProperties(mutation, 'mutation', combinedCssSelectors, dataAttributePrefix),
      ),
    );

    let enrichedNavigateObservable: Observable<TimestampedEvent<NavigateEvent>> | undefined;

    if (window.navigation) {
      const navigateObservable = new Observable<Event>((observer) => {
        const handler = (event: Event): void => {
          observer.next({
            ...event,
            type: 'navigate',
          });
        };
        window.navigation.addEventListener('navigate', handler);
        return () => {
          window.navigation.removeEventListener('navigate', handler);
        };
      });
      enrichedNavigateObservable = multicast<TimestampedEvent<NavigateEvent>>(
        navigateObservable.map<TimestampedEvent<NavigateEvent>>(
          (navigate) =>
            dataExtractor.addAdditionalEventProperties(
              navigate,
              'navigate',
              combinedCssSelectors,
              dataAttributePrefix,
            ) as TimestampedEvent<NavigateEvent>,
        ),
      );
    }

    return {
      [ObservablesEnum.ClickObservable]: clickObservable as Observable<ElementBasedTimestampedEvent<MouseEvent>>,
      [ObservablesEnum.MutationObservable]: enrichedMutationObservable,
      [ObservablesEnum.NavigateObservable]: enrichedNavigateObservable,
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
      getEventProperties: (actionType, element) =>
        dataExtractor.getEventProperties(actionType, element, dataAttributePrefix),
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
      // TODO: This ? will be unnecessary once it's not an optional method
      /* istanbul ignore next */
      subscription?.unsubscribe();
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
