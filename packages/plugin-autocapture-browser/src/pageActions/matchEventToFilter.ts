import type { Filter } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import { closestCrossShadow, ElementBasedTimestampedEvent, ElementBasedEvent } from '../helpers';

/**
 * Matches an event to a single filter
 * @param event - The event to match
 * @param filter - The filter to match against
 * @param maxShadowCrossings - How many OPEN shadow boundaries the hierarchy
 *   match may cross toward light-DOM ancestors (0 = plain `closest`, the
 *   default and prior behavior). A tracked element inside a shadow tree can
 *   otherwise never match a labeled event whose selector targets an ancestor
 *   outside its component.
 * @returns boolean indicating if the event matches the filter
 */
export const matchEventToFilter = (
  event: ElementBasedTimestampedEvent<ElementBasedEvent>,
  filter: Filter,
  maxShadowCrossings = 0,
) => {
  try {
    if (filter.subprop_key === '[Amplitude] Element Text') {
      // TODO: add support for the other operators
      return (
        filter.subprop_op === 'is' &&
        filter.subprop_value.includes(event.targetElementProperties['[Amplitude] Element Text'] as string)
      );
    } else if (filter.subprop_key === '[Amplitude] Element Hierarchy') {
      // Check if the element ancestory matches the CSS selector, always check this last since it is the most expensive
      return (
        filter.subprop_op === 'autotrack css match' &&
        !!closestCrossShadow(event.closestTrackedAncestor, filter.subprop_value.toString(), maxShadowCrossings)
      );
    }
  } catch (error) {
    console.error('Error matching event to filter', error);
    return false;
  }
  return false;
};
