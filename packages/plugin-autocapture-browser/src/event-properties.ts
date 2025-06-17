/* eslint-disable no-restricted-globals */
import { ActionType } from '@amplitude/analytics-core';
import * as constants from './constants';
import { getText, getAttributesWithPrefix, removeEmptyProperties, getNearestLabel } from './helpers';
import { getHierarchy } from './hierarchy';

/**
 * Returns the Amplitude event properties for the given element.
 */
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
