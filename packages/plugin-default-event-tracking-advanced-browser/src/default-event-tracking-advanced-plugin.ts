/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-types';
import * as constants from './constants';
import {
  getText,
  isPageUrlAllowed,
  getAttributesWithPrefix,
  removeEmptyProperties,
  getNearestLabel,
  querySelectUniqueElements,
} from './helpers';
import { finder } from './libs/finder';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;
type ActionType = 'click' | 'change';

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

interface EventListener {
  element: Element;
  type: ActionType;
  handler: (event: Event) => void;
}

interface Options {
  /**
   * List of CSS selectors to allow auto tracking on.
   * When provided, allow elements matching any selector to be tracked.
   * Only the ['a', 'button', 'input', 'select', 'textarea', 'label'] tags are tracked regardless the selector provided here.
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
   * When provided, this function overwrites all other allowlist configurations.
   * If the function returns true, the event will be tracked.
   * If the function returns false, the event will not be tracked.
   * @param actionType - The type of action that triggered the event.
   * @param element - The element that triggered the event.
   */
  shouldTrackEventResolver?: (actionType: ActionType, element: Element) => boolean;

  /**
   * Prefix for data attributes to allow auto collecting.
   * Default is 'data-amp-auto-track-'.
   */
  dataAttributePrefix?: string;
}

export const defaultEventTrackingAdvancedPlugin = (options: Options = {}): BrowserEnrichmentPlugin => {
  const {
    cssSelectorAllowlist = DEFAULT_CSS_SELECTOR_ALLOWLIST,
    pageUrlAllowlist,
    shouldTrackEventResolver,
    dataAttributePrefix = DEFAULT_DATA_ATTRIBUTE_PREFIX,
  } = options;
  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  let observer: MutationObserver | undefined;
  let eventListeners: EventListener[] = [];

  const addEventListener = (element: Element, type: ActionType, handler: (event: Event) => void) => {
    element.addEventListener(type, handler);
    eventListeners.push({
      element: element,
      type: type,
      handler: handler,
    });
  };

  const removeEventListeners = () => {
    eventListeners.forEach((_ref) => {
      const element = _ref.element,
        type = _ref.type,
        handler = _ref.handler;
      /* istanbul ignore next */
      element?.removeEventListener(type, handler);
    });
    eventListeners = [];
  };

  const shouldTrackEvent = (actionType: ActionType, element: Element) => {
    /* istanbul ignore if */
    if (!element) {
      return false;
    }

    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    // Text nodes have no tag
    if (!tag) {
      return false;
    }

    if (shouldTrackEventResolver) {
      return shouldTrackEventResolver(actionType, element);
    }

    if (!isPageUrlAllowed(window.location.href, pageUrlAllowlist)) {
      return false;
    }

    /* istanbul ignore next */
    const elementType = (element as HTMLInputElement)?.type || '';
    if (typeof elementType === 'string') {
      switch (elementType.toLowerCase()) {
        case 'hidden':
          return false;
        case 'password':
          return false;
      }
    }

    /* istanbul ignore if */
    if (cssSelectorAllowlist) {
      const hasMatchAnyAllowedSelector = cssSelectorAllowlist.some((selector) => !!element?.matches?.(selector));
      if (!hasMatchAnyAllowedSelector) {
        return false;
      }
    }

    switch (tag) {
      case 'input':
      case 'select':
      case 'textarea':
        return actionType === 'change' || actionType === 'click';
      default: {
        /* istanbul ignore next */
        const computedStyle = window?.getComputedStyle?.(element);
        /* istanbul ignore next */
        if (computedStyle && computedStyle.getPropertyValue('cursor') === 'pointer' && actionType === 'click') {
          return true;
        }
        return actionType === 'click';
      }
    }
  };

  const getEventProperties = (actionType: ActionType, element: Element) => {
    const tag = element.tagName.toLowerCase();
    /* istanbul ignore next */
    const rect =
      typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { left: null, top: null };
    const ariaLabel = element.getAttribute('aria-label');
    const attributes = getAttributesWithPrefix(element, dataAttributePrefix);
    const nearestLabel = getNearestLabel(element);
    const selector = finder(element);
    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID]: element.id,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS]: element.className,
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
    /* istanbul ignore if */
    if (typeof document === 'undefined') {
      return;
    }
    const addListener = (el: Element) => {
      if (shouldTrackEvent('click', el)) {
        addEventListener(el, 'click', (event: Event) => {
          // Limit to only the element that was clicked, not the propagated event.
          /* istanbul ignore next */
          if (event?.target != event?.currentTarget) {
            return;
          }
          /* istanbul ignore next */
          amplitude?.track(constants.AMPLITUDE_ELEMENT_CLICKED_EVENT, getEventProperties('click', el));
        });
      }
      if (shouldTrackEvent('change', el)) {
        addEventListener(el, 'change', (event: Event) => {
          // Limit to only the element that was clicked, not the propagated event.
          /* istanbul ignore next */
          if (event?.target != event?.currentTarget) {
            return;
          }
          /* istanbul ignore next */
          amplitude?.track(constants.AMPLITUDE_ELEMENT_CHANGED_EVENT, getEventProperties('change', el));
        });
      }
    };
    const allElements = querySelectUniqueElements(document.body, cssSelectorAllowlist);
    allElements.forEach(addListener);
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node: Node) => {
            addListener(node as Element);
            if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
              querySelectUniqueElements(node as Element, cssSelectorAllowlist).map(addListener);
            }
          });
        });
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
      });
    }
    /* istanbul ignore next */
    config?.loggerProvider?.log(`${name} has been successfully added.`);
  };

  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    if (observer) {
      observer.disconnect();
    }
    removeEventListeners();
  };

  return {
    name,
    type,
    setup,
    execute,
    teardown,
  };
};
