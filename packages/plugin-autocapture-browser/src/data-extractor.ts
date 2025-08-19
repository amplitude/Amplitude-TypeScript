/* eslint-disable no-restricted-globals */
import type { ElementInteractionsOptions } from '@amplitude/analytics-core';
import * as constants from './constants';
import { isNonSensitiveElement, isTextNode, removeEmptyProperties } from './helpers';
import type { JSONValue } from './helpers';

export class DataExtractor {
  private readonly additionalRedactTextPatterns: RegExp[];

  constructor(private readonly options: ElementInteractionsOptions & { redactTextRegex?: RegExp[] } = {}) {
    // TODO parse into a regex object
    this.additionalRedactTextPatterns = this.options.redactTextRegex ?? []; // TODO parse into a regex object
  }

  isNonSensitiveString = (text: string | null): boolean => {
    if (text == null) {
      return false;
    }
    if (typeof text === 'string') {
      const normalized = (text || '').replace(/[- ]/g, '');
      const ccRegex =
        /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
      if (ccRegex.test(normalized)) {
        return false;
      }
      const ssnRegex = /(^\d{3}-?\d{2}-?\d{4}$)/;
      if (ssnRegex.test(text)) {
        return false;
      }
      for (const pattern of this.additionalRedactTextPatterns) {
        try {
          if (pattern.test(text)) {
            return false;
          }
        } catch {
          // ignore invalid pattern
        }
      }
    }
    return true;
  };

  getText = (element: Element): string => {
    let text = '';
    if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
      for (const child of Array.from(element.childNodes)) {
        let childText = '';
        if (isTextNode(child)) {
          if (child.textContent) {
            childText = child.textContent;
          }
        } else {
          childText = this.getText(child as Element);
        }
        text += childText
          .split(/(\s+)/)
          .filter((t) => this.isNonSensitiveString(t))
          .join('')
          .replace(/[\r\n]/g, ' ')
          .replace(/[ ]+/g, ' ')
          .substring(0, 255);
      }
    }
    return text;
  };

  // Returns the element properties for the given element in Visual Labeling.
  getEventTagProps = (element: Element): Record<string, JSONValue> => {
    if (!element) {
      return {} as Record<string, JSONValue>;
    }
    const tag = element?.tagName?.toLowerCase?.();
    const properties: Record<string, JSONValue> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]:
        typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
    };
    return removeEmptyProperties(properties) as Record<string, JSONValue>;
  };
}
