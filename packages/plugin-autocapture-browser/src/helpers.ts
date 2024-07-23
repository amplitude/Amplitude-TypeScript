/* eslint-disable no-restricted-globals */
import { finder } from './libs/finder';
import * as constants from './constants';
import { Logger } from '@amplitude/analytics-types';
import { AutocaptureOptions, ElementBasedEvent, ElementBasedTimestampedEvent } from './autocapture-plugin';
import { ActionType } from './typings/autocapture';

export type JSONValue = string | number | boolean | { [x: string]: JSONValue } | Array<JSONValue>;

const SENSITIVE_TAGS = ['input', 'select', 'textarea'];

export type shouldTrackEvent = (actionType: ActionType, element: Element) => boolean;

export const createShouldTrackEvent = (
  autocaptureOptions: AutocaptureOptions,
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

export const getSelector = (element: Element, logger?: Logger): string => {
  let selector = '';
  try {
    selector = finder(element, {
      className: (name: string) => name !== constants.AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS,
    });
    return selector;
  } catch (error) {
    if (logger) {
      const typedError = error as Error;
      logger.warn(`Failed to get selector with finder, use fallback strategy instead: ${typedError.toString()}`);
    }
  }
  // Fall back to use tag, id, and class name, if finder fails.
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  if (tag) {
    selector = tag;
  }
  if (element.id) {
    selector = `#${element.id}`;
  } else if (element.className) {
    const classes = element.className
      .split(' ')
      .filter((name) => name !== constants.AMPLITUDE_VISUAL_TAGGING_HIGHLIGHT_CLASS)
      .join('.');
    if (classes) {
      selector = `${selector}.${classes}`;
    }
  }
  return selector;
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
  const labelElement = parent.querySelector(':scope>span,h1,h2,h3,h4,h5,h6');
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
export const getEventTagProps = (element: Element, logger?: Logger) => {
  if (!element) {
    return {};
  }
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  const selector = getSelector(element, logger);

  const properties: Record<string, JSONValue> = {
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: getText(element),
    [constants.AMPLITUDE_EVENT_PROP_ELEMENT_SELECTOR]: selector,
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
