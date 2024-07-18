/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, Logger } from '@amplitude/analytics-types';
import * as constants from './constants';
import { fromEvent, map, Observable, Subscription } from 'rxjs';
import {
  getText,
  getAttributesWithPrefix,
  removeEmptyProperties,
  getNearestLabel,
  getSelector,
  createShouldTrackEvent,
} from './helpers';
import { Messenger, WindowMessenger } from './libs/messenger';
import { ActionType } from './typings/autocapture';
import { getHierarchy } from './hierarchy';
import { trackClicks } from './autocapture/track-click';
import { trackChange } from './autocapture/track-change';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const DEFAULT_CSS_SELECTOR_ALLOWLIST = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[data-amp-default-track]',
  '.amp-default-track',
];
export const DEFAULT_DATA_ATTRIBUTE_PREFIX = 'data-amp-track-';

export interface AutocaptureOptions {
  /**
   * List of CSS selectors to allow auto tracking on.
   * When provided, allow elements matching any selector to be tracked.
   * Default is ['a', 'button', 'input', 'select', 'textarea', 'label', '[data-amp-default-track]', '.amp-default-track'].
   */
  cssSelectorAllowlist?: string[];

  /**
   * List of page URLs to allow auto tracking on.
   * When provided, only allow tracking on these URLs.
   * Both full URLs and regex are supported.
   */
  pageUrlAllowlist?: (string | RegExp)[];

  /**
   * Function to determine whether an event should be tracked.
   * When provided, this function overwrites all other allowlists and configurations.
   * If the function returns true, the event will be tracked.
   * If the function returns false, the event will not be tracked.
   * @param actionType - The type of action that triggered the event.
   * @param element - The element that triggered the event.
   */
  shouldTrackEventResolver?: (actionType: ActionType, element: Element) => boolean;

  /**
   * Prefix for data attributes to allow auto collecting.
   * Default is 'data-amp-track-'.
   */
  dataAttributePrefix?: string;

  /**
   * Options for integrating visual tagging selector.
   */
  visualTaggingOptions?: {
    enabled?: boolean;
    messenger?: Messenger;
  };

  /**
   * Debounce time in milliseconds for tracking events.
   * This is used to detect rage clicks.
   */
  debounceTime?: number;
}

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<AutocaptureOptions, 'debounceTime' | 'cssSelectorAllowlist'>
> &
  AutocaptureOptions;

enum ObservablesEnum {
  ClickObservable = 'clickObservable',
  ChangeObservable = 'changeObservable',
  ErrorObservable = 'errorObservable',
  PopstateObservable = 'popstateObservable',
  MutationObservable = 'mutationObservable',
}

type TimestampedEvent<T> = {
  event: T;
  timestamp: number;
  type: 'rage' | 'click' | 'change' | 'error' | 'popstate' | 'mutation';
};

export interface AllWindowObservables {
  [ObservablesEnum.ClickObservable]: Observable<TimestampedEvent<MouseEvent>>;
  [ObservablesEnum.ChangeObservable]: Observable<TimestampedEvent<Event>>;
  [ObservablesEnum.ErrorObservable]: Observable<TimestampedEvent<ErrorEvent>>;
  [ObservablesEnum.PopstateObservable]: Observable<TimestampedEvent<PopStateEvent>>;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
}

const addTimestamp = <T>(event: T, type: TimestampedEvent<any>['type']): TimestampedEvent<T> => ({
  event,
  timestamp: Date.now(),
  type,
});

export const autocapturePlugin = (options: AutocaptureOptions = {}): BrowserEnrichmentPlugin => {
  const {
    dataAttributePrefix = DEFAULT_DATA_ATTRIBUTE_PREFIX,
    visualTaggingOptions = {
      enabled: true,
      messenger: new WindowMessenger(),
    },
  } = options;

  options.cssSelectorAllowlist = options.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST;
  options.debounceTime = options.debounceTime ?? 1000;

  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Subscription[] = [];
  let logger: Logger | undefined = undefined;

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = fromEvent<MouseEvent>(document, 'click', { capture: true }).pipe(
      map((click) => addTimestamp(click, 'click')),
    );
    const changeObservable = fromEvent<Event>(document, 'change', { capture: true }).pipe(
      map((change) => addTimestamp(change, 'change')),
    );

    // Create Observable from unhandled errors
    const errorObservable = fromEvent<ErrorEvent>(window, 'error').pipe(map((error) => addTimestamp(error, 'error')));

    // add observable for URL changes
    const popstateObservable = fromEvent<PopStateEvent>(window, 'popstate').pipe(
      map((popstate) => addTimestamp(popstate, 'popstate')),
    );

    // Track DOM Mutations
    const mutationObservable = new Observable<MutationRecord[]>((observer) => {
      const mutationObserver = new MutationObserver((mutations) => {
        observer.next(mutations);
      });
      mutationObserver.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
      });
      return () => mutationObserver.disconnect();
    }).pipe(map((mutation) => addTimestamp(mutation, 'mutation')));

    return {
      [ObservablesEnum.ClickObservable]: clickObservable,
      [ObservablesEnum.ChangeObservable]: changeObservable,
      [ObservablesEnum.ErrorObservable]: errorObservable,
      [ObservablesEnum.PopstateObservable]: popstateObservable,
      [ObservablesEnum.MutationObservable]: mutationObservable,
    };
  };

  // Returns the Amplitude event properties for the given element.
  const getEventProperties = (actionType: ActionType, element: Element) => {
    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    /* istanbul ignore next */
    const rect =
      typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { left: null, top: null };
    const ariaLabel = element.getAttribute('aria-label');
    const attributes = getAttributesWithPrefix(element, dataAttributePrefix);
    const nearestLabel = getNearestLabel(element);
    const selector = getSelector(element, logger);
    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID]: element.id,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS]: element.className,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]: getHierarchy(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: getText(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL]: ariaLabel,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]: attributes,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_SELECTOR]: selector,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_PARENT_LABEL]: nearestLabel,
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
      [constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]: (typeof document !== 'undefined' && document.title) || '',
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: window.innerHeight,
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: window.innerWidth,
    };
    if (tag === 'a' && actionType === 'click' && element instanceof HTMLAnchorElement) {
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF] = element.href;
    }
    return removeEmptyProperties(properties);
  };

  const setup: BrowserEnrichmentPlugin['setup'] = async (config, amplitude) => {
    if (!amplitude) {
      /* istanbul ignore next */
      config?.loggerProvider?.warn(
        `${name} plugin requires a later version of @amplitude/analytics-browser. Events are not tracked.`,
      );
      return;
    }
    logger = config.loggerProvider;

    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }

    const shouldTrackEvent = createShouldTrackEvent(options);

    const allObservables = createObservables();
    const clickTrackingSubscription = trackClicks({
      allObservables,
      options: options as AutoCaptureOptionsWithDefaults,
      getEventProperties,
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
    });
    subscriptions.push(clickTrackingSubscription);

    const changeSubscription = trackChange({
      allObservables,
      options: options as AutoCaptureOptionsWithDefaults,
      getEventProperties,
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
    });
    subscriptions.push(changeSubscription);

    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);

    // Setup visual tagging selector
    if (window.opener && visualTaggingOptions.enabled) {
      /* istanbul ignore next */
      visualTaggingOptions.messenger?.setup({
        logger: config?.loggerProvider,
        ...(config?.serverZone && { endpoint: constants.AMPLITUDE_ORIGINS_MAP[config.serverZone] }),
        isElementSelectable: createShouldTrackEvent(options),
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
