/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin, IngestionMetadata } from '@amplitude/analytics-types';
import * as constants from './constants';
import { getText } from './helpers';

type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;
type ActionType = 'click' | 'change';

const DEFAULT_TAG_ALLOWLIST = ['a', 'button', 'input', 'select', 'textarea', 'label'];

interface EventListener {
  element: Element;
  type: ActionType;
  handler: () => void;
}

interface Options {
  cssSelectorAllowlist?: string[];
  tagAllowlist?: string[];
  ingestionMetadata?: IngestionMetadata; // Should avoid overriding this if unplanned to do so, this is not available in the charts.
}

export const autoTrackingPlugin = (options: Options = {}): BrowserEnrichmentPlugin => {
  const { tagAllowlist = DEFAULT_TAG_ALLOWLIST, cssSelectorAllowlist, ingestionMetadata } = options;
  const name = constants.PLUGIN_NAME;
  const type = 'enrichment';

  let observer: MutationObserver | undefined;
  let eventListeners: EventListener[] = [];

  const addEventListener = (element: Element, type: ActionType, handler: () => void) => {
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
    const elementType = (element as HTMLInputElement)?.type || '';
    if (typeof elementType === 'string') {
      switch (elementType.toLowerCase()) {
        case 'hidden':
          return false;
        case 'password':
          return false;
      }
    }
    const tag = element.tagName.toLowerCase();
    /* istanbul ignore if */
    if (!tagAllowlist.includes(tag)) {
      return false;
    }
    if (cssSelectorAllowlist) {
      const hasMatchAnyAllowedSelector = cssSelectorAllowlist.some((selector) => element.matches(selector));
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
    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID]: element.id,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS]: element.className,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: getText(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
      [constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]: (typeof document !== 'undefined' && document.title) || '',
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: window.innerHeight,
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: window.innerWidth,
    };
    if (tag === 'a' && actionType === 'click' && element instanceof HTMLAnchorElement) {
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF] = element.href;
    }
    return properties;
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
        addEventListener(el, 'click', () => {
          /* istanbul ignore next */
          amplitude?.track(constants.AMPLITUDE_ELEMENT_CLICKED_EVENT, getEventProperties('click', el));
        });
      }
      if (shouldTrackEvent('change', el)) {
        addEventListener(el, 'change', () => {
          /* istanbul ignore next */
          amplitude?.track(constants.AMPLITUDE_ELEMENT_CHANGED_EVENT, getEventProperties('change', el));
        });
      }
    };
    const allElements = Array.from(document.body.querySelectorAll(tagAllowlist.join(',')));
    allElements.forEach(addListener);
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node: Node) => {
            addListener(node as Element);
            if ('querySelectorAll' in node && typeof node.querySelectorAll === 'function') {
              Array.from(node.querySelectorAll(tagAllowlist.join(',')) as HTMLElement[]).map(addListener);
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
    const { sourceName, sourceVersion } = ingestionMetadata || {};
    if (sourceName && sourceVersion) {
      event.ingestion_metadata = {
        source_name: `${constants.INGESTION_METADATA_SOURCE_NAME_PREFIX}${sourceName}`, // Make sure the source name is prefixed with the correct context.
        source_version: sourceVersion,
      };
    }
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
