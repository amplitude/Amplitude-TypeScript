/* eslint-disable no-restricted-globals */
import type { ElementInteractionsOptions, ActionType } from '@amplitude/analytics-core';
import type { DataSource } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import * as constants from './constants';
import {
  isTextNode,
  removeEmptyProperties,
  isNonSensitiveElement,
  getRedactedAttributeNamesAndAttributesWithPrefix,
  isElementPointerCursor,
  getClosestElement,
  isElementBasedEvent,
} from './helpers';
import type { BaseTimestampedEvent, ElementBasedTimestampedEvent, TimestampedEvent } from './helpers';
import { getHierarchy } from './hierarchy';
import type { JSONValue } from './helpers';
import { getDataSource } from './pageActions/actions';

const CC_REGEX =
  /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
const SSN_REGEX = /(^\d{3}-?\d{2}-?\d{4}$)/;
const EMAIL_REGEX = /[^\s@]+@[^\s@.]+\.[^\s@]+/;

export class DataExtractor {
  private readonly additionalMaskTextPatterns: RegExp[];

  constructor(options: ElementInteractionsOptions) {
    const rawPatterns = options.maskTextRegex ?? [];

    const compiled: RegExp[] = [];
    for (const entry of rawPatterns) {
      if (compiled.length >= constants.MAX_MASK_TEXT_PATTERNS) {
        break;
      }
      if (entry instanceof RegExp) {
        compiled.push(entry);
      } else if ('pattern' in entry && typeof entry.pattern === 'string') {
        try {
          compiled.push(new RegExp(entry.pattern));
        } catch {
          // ignore invalid pattern strings
        }
      }
    }
    this.additionalMaskTextPatterns = compiled;
  }

  isNonSensitiveString = (text: string | null): boolean => {
    if (typeof text !== 'string') {
      return true;
    }

    // Check for credit card number
    if (CC_REGEX.test((text || '').replace(/[- ]/g, ''))) {
      return false;
    }

    // Check for social security number or email
    if (SSN_REGEX.test(text) || EMAIL_REGEX.test(text)) {
      return false;
    }

    // Check for additional mask text patterns
    for (const pattern of this.additionalMaskTextPatterns) {
      try {
        if (pattern.test(text)) {
          return false;
        }
      } catch {
        // ignore invalid pattern
      }
    }

    return true;
  };

  getNearestLabel = (element: Element): string => {
    const parent = element.parentElement;
    if (!parent) {
      return '';
    }
    let labelElement: Element | null;
    try {
      labelElement = parent.querySelector(':scope>span,h1,h2,h3,h4,h5,h6');
    } catch {
      /* istanbul ignore next */
      labelElement = null;
    }
    if (labelElement) {
      /* istanbul ignore next */
      const labelText = labelElement.textContent || '';
      return this.isNonSensitiveString(labelText) ? labelText : '';
    }
    return this.getNearestLabel(parent);
  };

  // Returns the Amplitude event properties for the given element.
  getEventProperties = (actionType: ActionType, element: Element, dataAttributePrefix: string) => {
    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();
    /* istanbul ignore next */
    const rect =
      typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : { left: null, top: null };

    const { attributes, redactedAttributeNames } = getRedactedAttributeNamesAndAttributesWithPrefix(
      element,
      dataAttributePrefix,
    );
    const nearestLabel = this.getNearestLabel(element);

    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]: getHierarchy(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]: attributes,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_PARENT_LABEL]: nearestLabel,
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
      [constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]: (typeof document !== 'undefined' && document.title) || '',
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: window.innerHeight,
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: window.innerWidth,
    };

    // Add non-redacted attributes conditionally
    // id is never redacted, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID] = element.getAttribute('id') || '';

    // class is never redacted, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS] = element.getAttribute('class');

    if (!redactedAttributeNames.has('aria-label')) {
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL] = element.getAttribute('aria-label');
    }

    if (
      tag === 'a' &&
      actionType === 'click' &&
      element instanceof HTMLAnchorElement &&
      !redactedAttributeNames.has('href')
    ) {
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF] = element.href;
    }

    return removeEmptyProperties(properties);
  };

  addAdditionalEventProperties = <T>(
    event: T,
    type: TimestampedEvent<T>['type'],
    selectorAllowlist: string[],
    dataAttributePrefix: string,
    // capture the event if the cursor is a "pointer" when this element is clicked on
    // reason: a "pointer" cursor indicates that an element should be interactable
    //         regardless of the element's tag name
    isCapturingCursorPointer = false,
  ): TimestampedEvent<T> | ElementBasedTimestampedEvent<T> => {
    const baseEvent: BaseTimestampedEvent<T> | ElementBasedTimestampedEvent<T> = {
      event,
      timestamp: Date.now(),
      type,
    };

    if (isElementBasedEvent(baseEvent) && baseEvent.event.target !== null) {
      if (isCapturingCursorPointer) {
        const isCursorPointer = isElementPointerCursor(baseEvent.event.target as Element, baseEvent.type);
        if (isCursorPointer) {
          baseEvent.closestTrackedAncestor = baseEvent.event.target as HTMLElement;
          baseEvent.targetElementProperties = this.getEventProperties(
            baseEvent.type,
            baseEvent.closestTrackedAncestor,
            dataAttributePrefix,
          );
          return baseEvent;
        }
      }
      // Retrieve additional event properties from the target element
      const closestTrackedAncestor = getClosestElement(baseEvent.event.target as HTMLElement, selectorAllowlist);
      if (closestTrackedAncestor) {
        baseEvent.closestTrackedAncestor = closestTrackedAncestor;
        baseEvent.targetElementProperties = this.getEventProperties(
          baseEvent.type,
          closestTrackedAncestor,
          dataAttributePrefix,
        );
      }
      return baseEvent;
    }

    return baseEvent;
  };

  extractDataFromDataSource = (dataSource: DataSource, contextElement: HTMLElement) => {
    // Extract from DOM Element
    if (dataSource.sourceType === 'DOM_ELEMENT') {
      const sourceElement = getDataSource(dataSource, contextElement);
      if (!sourceElement) {
        return undefined;
      }

      if (dataSource.elementExtractType === 'TEXT') {
        return this.getText(sourceElement);
      } else if (dataSource.elementExtractType === 'ATTRIBUTE' && dataSource.attribute) {
        return sourceElement.getAttribute(dataSource.attribute);
      }
      return undefined;
    }

    // TODO: Extract from other source types
    return undefined;
  };

  combineText = (element: Element): string => {
    let text = '';
    if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
      element.childNodes.forEach((child) => {
        let childText = '';
        if (isTextNode(child)) {
          if (child.textContent) {
            childText = child.textContent;
          }
        } else {
          childText = this.combineText(child as Element);
        }
        text += childText
          .split(/(\s+)/)
          .filter(this.isNonSensitiveString)
          .join('')
          .replace(/[\r\n]/g, ' ')
          .replace(/[ ]+/g, ' ')
          .substring(0, 255);
      });
    }
    return text;
  };

  getText = (element: Element): string => {
    return this.combineText(element).trim();
  };

  // Returns the element properties for the given element in Visual Labeling.
  getEventTagProps = (element: Element): Record<string, JSONValue> => {
    if (!element) {
      return {};
    }
    /* istanbul ignore next */
    const tag = element?.tagName?.toLowerCase?.();

    const properties = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
    };
    return removeEmptyProperties(properties) as Record<string, JSONValue>;
  };
}
