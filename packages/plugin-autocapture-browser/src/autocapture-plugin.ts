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
  getClosestElement,
} from './helpers';
import { Messenger, WindowMessenger } from './libs/messenger';
import { ActionType } from './typings/autocapture';
import { getHierarchy } from './hierarchy';
import { trackClicks } from './autocapture/track-click';
import { trackChange } from './autocapture/track-change';
import { trackActionClick } from './autocapture/track-action-click';
import { HasEventTargetAddRemove } from 'rxjs/internal/observable/fromEvent';

declare global {
  interface Window {
    navigation: HasEventTargetAddRemove<Event>;
  }
}

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
  /** @see https://github.com/WICG/navigation-api/pull/264 */
  readonly sourceElement: Element | null;

  scroll(): void;
}

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
export const DEFAULT_ACTION_CLICK_ALLOWLIST = ['div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
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

  /**
   * CSS selector allowlist for tracking clicks that result in a DOM change/navigation on elements not already allowed by the cssSelectorAllowlist
   */
  actionClickAllowlist?: string[];
}

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<AutocaptureOptions, 'debounceTime' | 'cssSelectorAllowlist' | 'actionClickAllowlist'>
> &
  AutocaptureOptions;

export enum ObservablesEnum {
  ClickObservable = 'clickObservable',
  ChangeObservable = 'changeObservable',
  // ErrorObservable = 'errorObservable',
  NavigateObservable = 'navigateObservable',
  MutationObservable = 'mutationObservable',
}

// Base TimestampedEvent type
type BaseTimestampedEvent<T> = {
  event: T;
  timestamp: number;
  type: 'rage' | 'click' | 'change' | 'error' | 'navigate' | 'mutation';
};

// Specific types for events with targetElementProperties
export type ElementBasedEvent = MouseEvent | Event;
export type ElementBasedTimestampedEvent<T> = BaseTimestampedEvent<T> & {
  event: MouseEvent | Event;
  type: 'click' | 'change';
  closestTrackedAncestor: Element;
  targetElementProperties: Record<string, any>;
};

// Union type for all possible TimestampedEvents
export type TimestampedEvent<T> = BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T>;

export interface AllWindowObservables {
  [ObservablesEnum.ClickObservable]: Observable<ElementBasedTimestampedEvent<MouseEvent>>;
  [ObservablesEnum.ChangeObservable]: Observable<ElementBasedTimestampedEvent<Event>>;
  // [ObservablesEnum.ErrorObservable]: Observable<TimestampedEvent<ErrorEvent>>;
  [ObservablesEnum.NavigateObservable]: Observable<TimestampedEvent<NavigateEvent>> | undefined;
  [ObservablesEnum.MutationObservable]: Observable<TimestampedEvent<MutationRecord[]>>;
}

// Type predicate
export function isElementBasedEvent<T>(event: BaseTimestampedEvent<T>): event is ElementBasedTimestampedEvent<T> {
  return event.type === 'click' || event.type === 'change';
}

export const autocapturePlugin = (options: AutocaptureOptions = {}): BrowserEnrichmentPlugin => {
  const {
    dataAttributePrefix = DEFAULT_DATA_ATTRIBUTE_PREFIX,
    visualTaggingOptions = {
      enabled: true,
      messenger: new WindowMessenger(),
    },
  } = options;

  options.cssSelectorAllowlist = options.cssSelectorAllowlist ?? DEFAULT_CSS_SELECTOR_ALLOWLIST;
  options.actionClickAllowlist = options.actionClickAllowlist ?? DEFAULT_ACTION_CLICK_ALLOWLIST;
  options.debounceTime = options.debounceTime ?? 1000;

  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  const subscriptions: Subscription[] = [];
  let logger: Logger | undefined = undefined;

  // Create observables on events on the window
  const createObservables = (): AllWindowObservables => {
    // Create Observables from direct user events
    const clickObservable = fromEvent<MouseEvent>(document, 'click', { capture: true }).pipe(
      map((click) => addAdditionalEventProperties(click, 'click')),
    );
    const changeObservable = fromEvent<Event>(document, 'change', { capture: true }).pipe(
      map((change) => addAdditionalEventProperties(change, 'change')),
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
        map((navigate) => addAdditionalEventProperties(navigate, 'navigate')),
      );
    }

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
    }).pipe(map((mutation) => addAdditionalEventProperties(mutation, 'mutation')));

    return {
      [ObservablesEnum.ClickObservable]: clickObservable as Observable<ElementBasedTimestampedEvent<MouseEvent>>,
      [ObservablesEnum.ChangeObservable]: changeObservable as Observable<ElementBasedTimestampedEvent<Event>>,
      // [ObservablesEnum.ErrorObservable]: errorObservable,
      [ObservablesEnum.NavigateObservable]: navigateObservable,
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

  const addAdditionalEventProperties = <T>(
    event: T,
    type: TimestampedEvent<T>['type'],
  ): TimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
    const baseEvent: BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T> = {
      event,
      timestamp: Date.now(),
      type,
    };

    if (isElementBasedEvent(baseEvent) && baseEvent.event.target !== null) {
      // Retrieve additional event properties from the target element
      const closestTrackedAncestor = getClosestElement(
        baseEvent.event.target as HTMLElement,
        (options as AutoCaptureOptionsWithDefaults).cssSelectorAllowlist,
      );
      if (closestTrackedAncestor) {
        baseEvent.closestTrackedAncestor = closestTrackedAncestor;
        baseEvent.targetElementProperties = getEventProperties(baseEvent.type, closestTrackedAncestor);
      }
      return baseEvent;
    }

    return baseEvent;
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
    });
    subscriptions.push(clickTrackingSubscription);

    const changeSubscription = trackChange({
      allObservables,
      getEventProperties,
      amplitude,
      shouldTrackEvent: shouldTrackEvent,
    });
    subscriptions.push(changeSubscription);

    const actionClickSubscription = trackActionClick({
      allObservables,
      options: options as AutoCaptureOptionsWithDefaults,
      getEventProperties,
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
