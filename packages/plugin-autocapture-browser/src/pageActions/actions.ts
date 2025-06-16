import type { DataSource, PageAction } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import type { ElementBasedEvent, ElementBasedTimestampedEvent } from 'src/autocapture-plugin';

// Get DataSource
/**
 * Gets the DOM element specified by the data source configuration
 * @param dataSource - Configuration for finding the target element
 * @param contextElement - The element to start searching from
 * @returns The matching DOM element or undefined if not found
 */
export const getDataSource = (dataSource: DataSource, contextElement: HTMLElement) => {
  // Only process DOM_ELEMENT type data sources
  if (dataSource.sourceType === 'DOM_ELEMENT') {
    // If scope is specified, find the closest ancestor matching the scope rather than using documentElement (html) as the scope
    let scopingElement: HTMLElement | null = document.documentElement;
    if (dataSource.scope && contextElement) {
      scopingElement = contextElement.closest(dataSource.scope);
    }

    // If we have both a scope and selector, find the matching element
    if (scopingElement && dataSource.selector) {
      return scopingElement.querySelector(dataSource.selector);
    }

    // Return scopingElement if no selector was specified
    return scopingElement;
  }

  // Return undefined for non-DOM_ELEMENT data sources
  return undefined;
};

// extract DataSource
export const extractDataFromDataSource = (dataSource: DataSource, contextElement: HTMLElement) => {
  // Extract from DOM Element
  if (dataSource.sourceType === 'DOM_ELEMENT') {
    const sourceElement = getDataSource(dataSource, contextElement);
    if (!sourceElement) {
      return undefined;
    }

    if (dataSource.elementExtractType === 'TEXT') {
      return sourceElement.textContent;
    } else if (dataSource.elementExtractType === 'ATTRIBUTE' && dataSource.attribute) {
      return sourceElement.getAttribute(dataSource.attribute);
    }
    return undefined;
  }

  // TODO: Extract from other source types
  return undefined;
};

// Execute actions for a condition and attach event properties to the event if needed
export const executeActions = (
  actions: (string | PageAction)[],
  ev: ElementBasedTimestampedEvent<ElementBasedEvent>,
) => {
  actions.forEach((action) => {
    // Skip if actions is string until action set is implemented
    if (typeof action === 'string') {
      return;
    }

    if (action.actionType === 'ATTACH_EVENT_PROPERTY') {
      const data = extractDataFromDataSource(action.dataSource, ev.closestTrackedAncestor as HTMLElement);

      // Attach data to event
      ev.targetElementProperties[action.destinationKey] = data;
    }
  });
  console.log(ev.targetElementProperties);
};
