import type { Filter } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import type { ElementBasedEvent } from 'src/autocapture-plugin';
import { ElementBasedTimestampedEvent } from 'src/helpers';

/**
 * Matches an event to a single filter
 * @param event - The event to match
 * @param filter - The filter to match against
 * @returns boolean indicating if the event matches the filter
 */
export const matchEventToFilter = (event: ElementBasedTimestampedEvent<ElementBasedEvent>, filter: Filter) => {
  try {
    if (filter.subprop_key === '[Amplitude] Element Text') {
      // TODO: add support for the other operators
      return (
        filter.subprop_op === 'exact' &&
        filter.subprop_value.includes(event.targetElementProperties['[Amplitude] Element Text'] as string)
      );
    } else if (filter.subprop_key === '[Amplitude] Element Hierarchy') {
      // Check if the element ancestory matches the CSS selector, always check this last since it is the most expensive
      return (
        filter.subprop_op === 'autotrack css match' &&
        !!event.closestTrackedAncestor.closest(filter.subprop_value.toString())
      );
    }
  } catch (error) {
    console.error('Error matching event to filter', error);
    return false;
  }
  return false;
};
