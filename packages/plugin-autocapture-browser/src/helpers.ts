/* eslint-disable no-restricted-globals */
import * as constants from './constants';
import { ElementInteractionsOptions, ActionType, isUrlMatchAllowlist } from '@amplitude/analytics-core';

export type JSONValue = string | number | boolean | null | { [x: string]: JSONValue } | Array<JSONValue>;

const SENSITIVE_TAGS = ['input', 'select', 'textarea'];

export type shouldTrackEvent = (actionType: ActionType, element: Element) => boolean;

export const isElementPointerCursor = (element: Element, actionType: ActionType): boolean => {
  /* istanbul ignore next */
  const computedStyle = window?.getComputedStyle?.(element);
  /* istanbul ignore next */
  return computedStyle?.getPropertyValue('cursor') === 'pointer' && actionType === 'click';
};

export const createShouldTrackEvent = (
  autocaptureOptions: ElementInteractionsOptions,
  allowlist: string[], // this can be any type of css selector allow list
  isAlwaysCaptureCursorPointer = false,
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

    if (!isUrlMatchAllowlist(window.location.href, pageUrlAllowlist)) {
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

    const isCursorPointer = isElementPointerCursor(element, actionType);

    if (isAlwaysCaptureCursorPointer && isCursorPointer) {
      return true;
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
        /* istanbul ignore next */
        if (isCursorPointer) {
          return true;
        }
        return actionType === 'click';
      }
    }
  };
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

/**
 * Collects redacted attribute names from element and ancestor elements with data-amp-mask-attributes
 * The 'id' and 'class' attributes cannot be redacted as they're critical for element identification
 * @param element - The target element to check for redaction attributes
 * @returns Set of attribute names that should be redacted
 */
/**
 * Parses a comma-separated string of attribute names and filters out protected attributes
 * @param attributeString - Comma-separated string of attribute names
 * @returns Array of valid attribute names, excluding 'id' and 'class'
 */
export const parseAttributesToRedact = (attributeString: string): string[] => {
  return attributeString
    .split(',')
    .map((attr) => attr.trim())
    .filter((attr) => attr.length > 0)
    .filter((attr) => attr !== 'id' && attr !== 'class'); // Prevent 'id' and 'class' from being redacted as they're critical for element identification
};

export const getRedactedAttributeNames = (element: Element): Set<string> => {
  const redactedAttributes = new Set<string>();
  let currentElement: Element | null = element.closest(`[${constants.DATA_AMP_MASK_ATTRIBUTES}]`); // closest invokes native libraries and is more performant than using JS to visit every ancestor

  // Walk up the DOM tree to find any data-amp-mask-attributes
  while (currentElement) {
    const redactValue = currentElement.getAttribute(constants.DATA_AMP_MASK_ATTRIBUTES);
    if (redactValue) {
      // Parse comma-separated attribute names and add to set
      const attributesToRedact = parseAttributesToRedact(redactValue);
      attributesToRedact.forEach((attr) => {
        redactedAttributes.add(attr);
      });
    }
    currentElement = currentElement.parentElement?.closest(`[${constants.DATA_AMP_MASK_ATTRIBUTES}]`) || null;
  }

  return redactedAttributes;
};

export const getAttributesWithPrefix = (element: Element, prefix: string): { [key: string]: string } => {
  const redactedAttributes = getRedactedAttributeNames(element);

  return element.getAttributeNames().reduce((attributes: { [key: string]: string }, attributeName) => {
    if (attributeName.startsWith(prefix)) {
      const attributeKey = attributeName.replace(prefix, '');

      // Skip redacted attributes
      if (redactedAttributes.has(attributeKey)) {
        return attributes;
      }

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

export const removeEmptyProperties = (properties: { [key: string]: unknown }): { [key: string]: unknown } => {
  return Object.keys(properties).reduce((filteredProperties: { [key: string]: unknown }, key) => {
    const value = properties[key];
    if (!isEmpty(value)) {
      filteredProperties[key] = value;
    }
    return filteredProperties;
  }, {});
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

export type AutoCaptureOptionsWithDefaults = Required<
  Pick<ElementInteractionsOptions, 'debounceTime' | 'cssSelectorAllowlist' | 'actionClickAllowlist'>
> &
  ElementInteractionsOptions;

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

export type evaluateTriggersFn = (
  event: ElementBasedTimestampedEvent<ElementBasedEvent>,
) => ElementBasedTimestampedEvent<ElementBasedEvent>;

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
