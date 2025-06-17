/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  FrustrationInteractionsOptions,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  DEFAULT_CSS_SELECTOR_ALLOWLIST,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { fromEvent, map, Observable, Subscription, share } from 'rxjs';
import {
  addAdditionalEventProperties,
  createShouldTrackEvent,
  ElementBasedTimestampedEvent,
  getEventProperties,
} from './helpers';
import { trackDeadClick } from './autocapture/track-dead-click';
import { trackRageClicks } from './autocapture/track-rage-click';
import { AllWindowObservables, ObservablesEnum } from './autocapture-plugin';
import { getGlobalClickObservable, getGlobalMutationObservable } from './observables';

interface NavigateEvent extends Event {
  readonly navigationType: 'reload' | 'push' | 'replace' | 'traverse';
  readonly destination: {
    readonly url: string;
    readonly key: string | null;
    readonly id: string | null;
    readonly index: number;
    readonly sameDocument: boolean;
    getState(): any;
  };
  readonly canIntercept: boolean;
  readonly userInitiated: boolean;
  readonly hashChange: boolean;
  readonly signal: AbortSignal;
  readonly formData: FormData | null;
  readonly downloadRequest: string | null;
  readonly info: any;
  readonly hasUAVisualTransition: boolean;
  readonly sourceElement: Element | null;
  scroll(): void;
}

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const frustrationPlugin = (options: FrustrationInteractionsOptions): BrowserEnrichmentPlugin => {
  const name = constants.FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  // TODO: add visualTagging stuff here too

  const subscriptions: Subscription[] = [];

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = getGlobalClickObservable().pipe(
      map((click) => {
        return addAdditionalEventProperties(
          click,
          'click',
          /* istanbul ignore next */
          options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST,
          /* istanbul ignore next */
          options.dataAttributePrefix ?? DEFAULT_DATA_ATTRIBUTE_PREFIX,
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
          addAdditionalEventProperties(
            navigate,
            'navigate',
            options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST,
            options.dataAttributePrefix ?? DEFAULT_DATA_ATTRIBUTE_PREFIX,
          ),
        ),
        share(),
      );
    }

    // Track DOM Mutations
    const enrichedMutationObservable = getGlobalMutationObservable().pipe(
      map((mutation) =>
        addAdditionalEventProperties(
          mutation,
          'mutation',
          /* istanbul ignore next */
          options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST,
          DEFAULT_DATA_ATTRIBUTE_PREFIX,
        ),
      ),
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
    const shouldTrackRageClick = createShouldTrackEvent(
      options,
      options.rageClicks?.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST,
    );
    const shouldTrackDeadClick = createShouldTrackEvent(
      options,
      options.deadClicks?.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST,
    );

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
        getEventProperties(actionType, element, DEFAULT_DATA_ATTRIBUTE_PREFIX),
      shouldTrackDeadClick,
    });
    subscriptions.push(deadClickSubscription);

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);
  };

  /* istanbul ignore next */
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  /* istanbul ignore next */
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
