/* eslint-disable no-restricted-globals */
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  FrustrationInteractionsOptions,
  DEFAULT_DATA_ATTRIBUTE_PREFIX,
  multicast,
  Observable,
  Unsubscribable,
  DEFAULT_RAGE_CLICK_ALLOWLIST,
  DEFAULT_DEAD_CLICK_ALLOWLIST,
  DEFAULT_ERROR_CLICK_ALLOWLIST,
} from '@amplitude/analytics-core';
import * as constants from './constants';
import { createShouldTrackEvent, ElementBasedTimestampedEvent, NavigateEvent, TimestampedEvent } from './helpers';
import { trackDeadClick } from './autocapture/track-dead-click';
import { trackRageClicks } from './autocapture/track-rage-click';
import { ObservablesEnum } from './autocapture-plugin';
import {
  BrowserErrorEvent,
  createClickObservable,
  createErrorObservable,
  createMutationObservable,
} from './observables';
import { DataExtractor } from './data-extractor';
import { trackErrorClicks } from './autocapture/track-error-click';

export interface AllWindowObservables {
  [ObservablesEnum.ClickObservable]: Observable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
  [ObservablesEnum.BrowserErrorObservable]: Observable<TimestampedEvent<BrowserErrorEvent>>;
  [ObservablesEnum.NavigateObservable]?: Observable<TimestampedEvent<NavigateEvent>>;
  [ObservablesEnum.SelectionObservable]?: Observable<void>;
}

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

/**
 * Helper function to extract the css selector allowlist
 * from the frustration interactions options for a specific
 * autocapture feature.
 */
function getCssSelectorAllowlist(
  options: FrustrationInteractionsOptions,
  attribute: keyof FrustrationInteractionsOptions,
  defaultAllowlist: string[],
  enabled: boolean,
): string[] {
  if (!enabled) {
    return [];
  }
  const config = options[attribute];
  if (
    typeof config === 'object' &&
    config !== null &&
    'cssSelectorAllowlist' in config &&
    Array.isArray(config.cssSelectorAllowlist)
  ) {
    return config.cssSelectorAllowlist;
  }
  return defaultAllowlist;
}

export const frustrationPlugin = (options: FrustrationInteractionsOptions = {}): BrowserEnrichmentPlugin => {
  const name = constants.FRUSTRATION_PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Unsubscribable[] = [];

  let isErrorClicksEnabled = options.errorClicks !== false;

  // if errorClicks is not defined, disable it
  // change this once it moves out of @experimental
  if (!options.errorClicks) {
    isErrorClicksEnabled = false;
  }

  // Check if each feature is enabled
  const deadClicksEnabled = options.deadClicks !== false && options.deadClicks !== null;
  const rageClicksEnabled = options.rageClicks !== false && options.rageClicks !== null;

  // Get CSS selectors for enabled features
  const rageCssSelectors = getCssSelectorAllowlist(
    options,
    'rageClicks',
    DEFAULT_RAGE_CLICK_ALLOWLIST,
    rageClicksEnabled,
  );
  const deadCssSelectors = getCssSelectorAllowlist(
    options,
    'deadClicks',
    DEFAULT_DEAD_CLICK_ALLOWLIST,
    deadClicksEnabled,
  );

  const errorCssSelectors = getCssSelectorAllowlist(
    options,
    'errorClicks',
    DEFAULT_ERROR_CLICK_ALLOWLIST,
    isErrorClicksEnabled,
  );

  const dataAttributePrefix = options.dataAttributePrefix ?? DEFAULT_DATA_ATTRIBUTE_PREFIX;

  const dataExtractor = new DataExtractor(options);

  // combine the selector lists from enabled features to determine which clicked elements should be filtered
  const combinedCssSelectors = [...new Set([...rageCssSelectors, ...deadCssSelectors, ...errorCssSelectors])];

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    const clickObservable = multicast(
      createClickObservable('pointerdown').map((click) => {
        return dataExtractor.addAdditionalEventProperties(
          click,
          'click',
          combinedCssSelectors,
          dataAttributePrefix,
          true, // capture when cursor is pointer
        );
      }),
    );

    const browserErrorObservables = multicast(
      createErrorObservable().map((error) => {
        return dataExtractor.addTypeAndTimestamp(error, 'error');
      }),
    );

    const enrichedMutationObservable = multicast<TimestampedEvent<MutationRecord[]>>(
      createMutationObservable().map((mutation) =>
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

    const selectionObservable = multicast(
      new Observable<void>((observer) => {
        const handler = () => {
          const el: HTMLElement | null = document.activeElement as HTMLElement;

          // handle input and textarea

          // if the selectionStart and selectionEnd are the same, it means
          // nothing is selected (collapsed) and the cursor position is one point
          if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
            let start: number | null | undefined;
            let end: number | null | undefined;
            try {
              start = (el as HTMLInputElement | HTMLTextAreaElement).selectionStart;
              end = (el as HTMLInputElement | HTMLTextAreaElement).selectionEnd;
              if (start === end) return; // collapsed
            } catch (error) {
              // input that doesn't support selectionStart/selectionEnd (like checkbox)
              // do nothing here
              return;
            }
            return observer.next();
          }

          // handle non-input elements

          // non-input elements have an attribute called "isCollapsed" which
          // if true, indicates there "is currently not any text selected"
          // (see https://developer.mozilla.org/en-US/docs/Web/API/Selection/isCollapsed)
          const selection = window.getSelection();
          if (!selection || selection.isCollapsed) return;
          return observer.next();
        };
        window.document.addEventListener('selectionchange', handler);
        return () => {
          window.document.removeEventListener('selectionchange', handler);
        };
      }),
    );

    return {
      [ObservablesEnum.ClickObservable]: clickObservable as Observable<ElementBasedTimestampedEvent<MouseEvent>>,
      [ObservablesEnum.MutationObservable]: enrichedMutationObservable,
      [ObservablesEnum.NavigateObservable]: enrichedNavigateObservable,
      [ObservablesEnum.BrowserErrorObservable]: browserErrorObservables,
      [ObservablesEnum.SelectionObservable]: selectionObservable,
    };
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    // Create observables for events on the window
    const allObservables = createObservables();

    // Create subscriptions only for enabled features
    if (rageClicksEnabled) {
      const shouldTrackRageClick = createShouldTrackEvent(options, rageCssSelectors);
      const rageClickSubscription = trackRageClicks({
        allObservables,
        amplitude,
        shouldTrackRageClick,
      });
      subscriptions.push(rageClickSubscription);
    }

    if (deadClicksEnabled) {
      const shouldTrackDeadClick = createShouldTrackEvent(options, deadCssSelectors);
      const deadClickSubscription = trackDeadClick({
        amplitude,
        allObservables,
        getEventProperties: (actionType, element) =>
          dataExtractor.getEventProperties(actionType, element, dataAttributePrefix),
        shouldTrackDeadClick,
      });
      subscriptions.push(deadClickSubscription);
    }

    if (isErrorClicksEnabled) {
      const shouldTrackErrorClick = createShouldTrackEvent(options, errorCssSelectors);
      const errorClickSubscription = trackErrorClicks({
        amplitude,
        allObservables,
        shouldTrackErrorClick,
      });
      subscriptions.push(errorClickSubscription);
    }

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
