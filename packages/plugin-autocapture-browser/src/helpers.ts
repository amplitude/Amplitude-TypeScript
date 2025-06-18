/* eslint-disable no-restricted-globals */
import * as constants from './constants';
import { ElementInteractionsOptions, ActionType } from '@amplitude/analytics-core';
import { getHierarchy } from './hierarchy';

export type JSONValue = string | number | boolean | null | { [x: string]: JSONValue } | Array<JSONValue>;

const SENSITIVE_TAGS = ['input', 'select', 'textarea'];

export type shouldTrackEvent = (actionType: ActionType, element: Element) => boolean;

export const createShouldTrackEvent = (
  autocaptureOptions: ElementInteractionsOptions,
  allowlist: string[], // this can be any type of css selector allow list
): shouldTrackEvent => {
  return (actionType: ActionType, element: Element) => {
    const { pageUrlAllowlist, shouldTrackEventResolver } = autocaptureOptions;

    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    // window, document, and Text nodes have no tag
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
    const elementType = String(element?.getAttribute('type')) || '';
    if (typeof elementType === 'string') {
      switch (elementType.toLowerCase()) {
        case 'hidden':
          return false;
        case 'password':
          return false;
      }
    }

    /* istanbul ignore if */
    if (allowlist) {
      const hasMatchAnyAllowedSelector = allowlist.some((selector) => !!element?.matches?.(selector));
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
};

export const isNonSensitiveString = (text: string | null) => {
  if (text == null) {
    return false;
  }
  if (typeof text === 'string') {
    const ccRegex =
      /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
    if (ccRegex.test((text || '').replace(/[- ]/g, ''))) {
      return false;
    }
    const ssnRegex = /(^\d{3}-?\d{2}-?\d{4}$)/;
    if (ssnRegex.test(text)) {
      return false;
    }
  }
  return true;
};

export const isTextNode = (node: Node) => {
  return !!node && node.nodeType === 3;
};

export const isNonSensitiveElement = (element: Element) => {
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  const isContentEditable =
    element instanceof HTMLElement ? element.getAttribute('contenteditable')?.toLowerCase() === 'true' : false;

  return !SENSITIVE_TAGS.includes(tag) && !isContentEditable;
};

// Maybe this can be simplified with element.innerText, keep and manual concatenating for now, more research needed.
export const getText = (element: Element): string => {
  let text = '';
  if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
    element.childNodes.forEach((child) => {
      let childText = '';
      if (isTextNode(child)) {
        if (child.textContent) {
          childText = child.textContent;
        }
      } else {
        childText = getText(child as Element);
      }
      text += childText
        .split(/(\s+)/)
        .filter(isNonSensitiveString)
        .join('')
        .replace(/[\r\n]/g, ' ')
        .replace(/[ ]+/g, ' ')
        .substring(0, 255);
    });
  }
  return text;
};

export const isPageUrlAllowed = (url: string, pageUrlAllowlist: (string | RegExp)[] | undefined) => {
  if (!pageUrlAllowlist || !pageUrlAllowlist.length) {
    return true;
  }
  return pageUrlAllowlist.some((allowedUrl) => {
    if (typeof allowedUrl === 'string') {
      return url === allowedUrl;
    }
    return url.match(allowedUrl);
  });
};

export const getAttributesWithPrefix = (element: Element, prefix: string): { [key: string]: string } => {
  return element.getAttributeNames().reduce((attributes: { [key: string]: string }, attributeName) => {
    if (attributeName.startsWith(prefix)) {
      const attributeKey = attributeName.replace(prefix, '');
      const attributeValue = element.getAttribute(attributeName);
      if (attributeKey) {
        attributes[attributeKey] = attributeValue || '';
      }
    }
    return attributes;
  }, {});
};

export const isEmpty = (value: unknown) => {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && Object.keys(value).length === 0) ||
    (typeof value === 'string' && value.trim().length === 0)
  );
};

export const removeEmptyProperties = (properties: { [key: string]: unknown }) => {
  return Object.keys(properties).reduce((filteredProperties: { [key: string]: unknown }, key) => {
    const value = properties[key];
    if (!isEmpty(value)) {
      filteredProperties[key] = value;
    }
    return filteredProperties;
  }, {});
};

export const getNearestLabel = (element: Element): string => {
  const parent = element.parentElement;
  if (!parent) {
    return '';
  }
  let labelElement;
  try {
    labelElement = parent.querySelector(':scope>span,h1,h2,h3,h4,h5,h6');
  } catch (error) {
    /* istanbul ignore next */
    labelElement = null;
  }
  if (labelElement) {
    /* istanbul ignore next */
    const labelText = labelElement.textContent || '';
    return isNonSensitiveString(labelText) ? labelText : '';
  }
  return getNearestLabel(parent);
};

export const querySelectUniqueElements = (root: Element | Document, selectors: string[]): Element[] => {
  if (root && 'querySelectorAll' in root && typeof root.querySelectorAll === 'function') {
    const elementSet = selectors.reduce((elements: Set<Element>, selector) => {
      if (selector) {
        const selectedElements = Array.from(root.querySelectorAll(selector));
        selectedElements.forEach((element) => {
          elements.add(element);
        });
      }
      return elements;
    }, new Set<Element>());
    return Array.from(elementSet);
  }
  return [];
};

// Similar as element.closest, but works with multiple selectors
export const getClosestElement = (element: Element | null, selectors: string[]): Element | null => {
  if (!element) {
    return null;
  }
  /* istanbul ignore next */
  if (selectors.some((selector) => element?.matches?.(selector))) {
    return element;
  }
  /* istanbul ignore next */
  return getClosestElement(element?.parentElement, selectors);
};

// Returns the element properties for the given element in Visual Labeling.
export const getEventTagProps = (element: Element) => {
  if (!element) {
    return {};
  }
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();

  const properties: Record<string, JSONValue> = {
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: getText(element),
    [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
  };
  return removeEmptyProperties(properties);
};

export const asyncLoadScript = (url: string) => {
  return new Promise((resolve, reject) => {
    try {
      const scriptElement = document.createElement('script');
      scriptElement.type = 'text/javascript';
      scriptElement.async = true;
      scriptElement.src = url;
      scriptElement.addEventListener(
        'load',
        () => {
          resolve({ status: true });
        },
        { once: true },
      );
      scriptElement.addEventListener('error', () => {
        reject({
          status: false,
          message: `Failed to load the script ${url}`,
        });
      });
      /* istanbul ignore next */
      document.head?.appendChild(scriptElement);
    } catch (error) {
      /* istanbul ignore next */
      reject(error);
    }
  });
};

export function generateUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const filterOutNonTrackableEvents = (event: ElementBasedTimestampedEvent<ElementBasedEvent>): boolean => {
  // Filter out changeEvent events with no target
  // This could happen when change events are triggered programmatically
  if (event.event.target === null || !event.closestTrackedAncestor) {
    return false;
  }

  return true;
};

// Returns the Amplitude event properties for the given element.
export const getEventProperties = (actionType: ActionType, element: Element, dataAttributePrefix: string) => {
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  /* istanbul ignore next */
  const rect =
    typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { left: null, top: null };
  const ariaLabel = element.getAttribute('aria-label');
  const attributes = getAttributesWithPrefix(element, dataAttributePrefix);
  const nearestLabel = getNearestLabel(element);
  /* istanbul ignore next */
  const properties: Record<string, any> = {
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID]: element.getAttribute('id') || '',
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS]: element.getAttribute('class'),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]: getHierarchy(element),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: getText(element),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL]: ariaLabel,
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]: attributes,
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

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<ElementInteractionsOptions, 'debounceTime' | 'cssSelectorAllowlist' | 'actionClickAllowlist'>
> &
  ElementInteractionsOptions;

export const addAdditionalEventProperties = <T>(
  event: T,
  type: TimestampedEvent<T>['type'],
  selectorAllowlist: string[],
  dataAttributePrefix: string,
): TimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
  const baseEvent: BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T> = {
    event,
    timestamp: Date.now(),
    type,
  };

  if (isElementBasedEvent(baseEvent) && baseEvent.event.target !== null) {
    // Retrieve additional event properties from the target element
    const closestTrackedAncestor = getClosestElement(baseEvent.event.target as HTMLElement, selectorAllowlist);
    if (closestTrackedAncestor) {
      baseEvent.closestTrackedAncestor = closestTrackedAncestor;
      baseEvent.targetElementProperties = getEventProperties(
        baseEvent.type,
        closestTrackedAncestor,
        dataAttributePrefix,
      );
    }
    return baseEvent;
  }

  return baseEvent;
};

// Base TimestampedEvent type
export type BaseTimestampedEvent<T> = {
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

export type evaluateTriggersFn = <T extends ElementBasedEvent>(
  event: ElementBasedTimestampedEvent<T>,
) => ElementBasedTimestampedEvent<T>;

// Union type for all possible TimestampedEvents
export type TimestampedEvent<T> = BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T>;

// Type predicate
export function isElementBasedEvent<T>(event: BaseTimestampedEvent<T>): event is ElementBasedTimestampedEvent<T> {
  return event.type === 'click' || event.type === 'change';
}

export interface NavigateEvent extends Event {
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
