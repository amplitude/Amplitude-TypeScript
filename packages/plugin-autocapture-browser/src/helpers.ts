/* eslint-disable no-restricted-globals */
import { finder } from './libs/finder';
import * as constants from './constants';
import { Logger } from '@amplitude/analytics-types';

const SENTITIVE_TAGS = ['input', 'select', 'textarea'];

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
  return !SENTITIVE_TAGS.includes(tag);
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

export const getEventTagProps = (element: Element, logger?: Logger) => {
  if (!element) {
    return {};
  }
  /* istanbul ignore next */
  const tag = element?.tagName?.toLowerCase?.();
  const selector = getSelector(element, logger);
  const properties: Record<string, string> = {
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

export function generateUniqueId() {
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}
