/* eslint-disable no-restricted-globals */
import type { ElementInteractionsOptions, ActionType } from '@amplitude/analytics-core';
import type { DataSource } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import * as constants from './constants';
import {
  removeEmptyProperties,
  getAttributesWithPrefix,
  isElementPointerCursor,
  getClosestElement,
  isElementBasedEvent,
  parseAttributesToRedact,
} from './helpers';
import type { BaseTimestampedEvent, ElementBasedTimestampedEvent, TimestampedEvent } from './helpers';
import { getAncestors, getElementProperties } from './hierarchy';
import type { JSONValue } from './helpers';
import { getDataSource } from './pageActions/actions';
import { Hierarchy } from './typings/autocapture';

const CC_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
const SSN_REGEX = /(\d{3}-?\d{2}-?\d{4})/g;
const EMAIL_REGEX = /[^\s@]+@[^\s@.]+\.[^\s@]+/g;

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

  replaceSensitiveString = (text: string | null): string => {
    if (typeof text !== 'string') {
      return '';
    }

    let result = text;

    // Check for credit card number (with or without spaces/dashes)
    result = result.replace(CC_REGEX, constants.MASKED_TEXT_VALUE);

    // Check for social security number
    result = result.replace(SSN_REGEX, constants.MASKED_TEXT_VALUE);

    // Check for email
    result = result.replace(EMAIL_REGEX, constants.MASKED_TEXT_VALUE);

    // Check for additional mask text patterns
    for (const pattern of this.additionalMaskTextPatterns) {
      try {
        result = result.replace(pattern, constants.MASKED_TEXT_VALUE);
      } catch {
        // ignore invalid pattern
      }
    }

    return result;
  };

  // Get the DOM hierarchy of the element, starting from the target element to the root element.
  getHierarchy = (element: Element | null): Hierarchy => {
    let hierarchy: Hierarchy = [];
    if (!element) {
      return [];
    }

    // Get list of ancestors including itself and get properties at each level in the hierarchy
    const ancestors = getAncestors(element);

    const elementToRedactedAttributesMap = new Map<Element, Set<string>>();
    const reversedAncestors = [...ancestors].reverse(); // root to target order

    for (let i = 0; i < reversedAncestors.length; i++) {
      const node = reversedAncestors[i];
      if (node) {
        const redactedAttributes = parseAttributesToRedact(node.getAttribute(constants.DATA_AMP_MASK_ATTRIBUTES));
        const ancestorRedactedAttributes =
          i === 0 ? [] : elementToRedactedAttributesMap.get(reversedAncestors[i - 1]) ?? new Set<string>();
        const allRedactedAttributes = new Set([...ancestorRedactedAttributes, ...redactedAttributes]);
        elementToRedactedAttributesMap.set(node, allRedactedAttributes);
      }
    }

    hierarchy = ancestors.map((el) =>
      getElementProperties(el, elementToRedactedAttributesMap.get(el) ?? new Set<string>()),
    );

    // Mask value in attributes
    for (const hieraryNode of hierarchy) {
      if (hieraryNode?.attrs) {
        Object.entries(hieraryNode.attrs).forEach(([key, value]) => {
          if (hieraryNode.attrs) {
            hieraryNode.attrs[key] = this.replaceSensitiveString(value);
          }
        });
      }
    }

    return hierarchy;
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
      return this.getText(labelElement);
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

    const hierarchy = this.getHierarchy(element);
    const currentElementAttributes = hierarchy[0]?.attrs;
    const nearestLabel = this.getNearestLabel(element);
    const attributes = getAttributesWithPrefix(currentElementAttributes ?? {}, dataAttributePrefix);

    /* istanbul ignore next */
    const properties: Record<string, any> = {
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]: hierarchy,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]: tag,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_TEXT]: this.getText(element),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_LEFT]: rect.left == null ? null : Math.round(rect.left),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_POSITION_TOP]: rect.top == null ? null : Math.round(rect.top),
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]: attributes,
      [constants.AMPLITUDE_EVENT_PROP_ELEMENT_PARENT_LABEL]: nearestLabel,
      [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: window.location.href.split('?')[0],
      [constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]:
        (typeof document !== 'undefined' && this.replaceSensitiveString(document.title)) || '',
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: window.innerHeight,
      [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: window.innerWidth,
    };

    // Add non-redacted attributes conditionally
    // id is never redacted, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID] = element.getAttribute('id') || '';

    // class is never redacted, so always include it
    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_CLASS] = element.getAttribute('class');

    properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL] = currentElementAttributes?.['aria-label'];

    if (tag === 'a' && actionType === 'click' && element instanceof HTMLAnchorElement) {
      properties[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF] = this.replaceSensitiveString(element.href);
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

  getText = (element: Element): string => {
    // Check if element or any parent has data-amp-mask attribute
    const hasMaskAttribute = element.closest(`[${constants.TEXT_MASK_ATTRIBUTE}]`) !== null;
    if (hasMaskAttribute) {
      return constants.MASKED_TEXT_VALUE;
    }
    let output = '';
    if (!element.querySelector(`[${constants.TEXT_MASK_ATTRIBUTE}], [contenteditable]`)) {
      output = (element as HTMLElement).innerText || '';
    } else {
      const clonedTree = element.cloneNode(true) as HTMLElement;
      // replace all elements with TEXT_MASK_ATTRIBUTE attribute and contenteditable with the text MASKED_TEXT_VALUE
      clonedTree.querySelectorAll(`[${constants.TEXT_MASK_ATTRIBUTE}], [contenteditable]`).forEach((node) => {
        (node as HTMLElement).innerText = constants.MASKED_TEXT_VALUE;
      });
      output = clonedTree.innerText || '';
    }
    return this.replaceSensitiveString(output.substring(0, 255)).replace(/\s+/g, ' ').trim();
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
