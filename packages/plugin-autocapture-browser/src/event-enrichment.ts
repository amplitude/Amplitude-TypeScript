import { ElementBasedTimestampedEvent, TimestampedEvent, isElementBasedEvent } from './autocapture-plugin';
import { getClosestElement } from './helpers';
import { getEventProperties } from './event-properties';

type BaseTimestampedEvent<T> = {
  event: T;
  timestamp: number;
  type: 'click' | 'change' | 'navigate' | 'mutation';
};

/**
 * Adds additional event properties to the base event based on the event type and target element.
 */
export const addAdditionalEventProperties = <T>(
  event: T,
  type: TimestampedEvent<T>['type'],
  cssSelectorAllowlist: string[],
  dataAttributePrefix: string,
): TimestampedEvent<T> => {
  const baseEvent: BaseTimestampedEvent<T> = {
    event,
    timestamp: Date.now(),
    type,
  };

  if (isElementBasedEvent(baseEvent) && baseEvent.event.target !== null) {
    // Retrieve additional event properties from the target element
    const closestTrackedAncestor = getClosestElement(baseEvent.event.target as HTMLElement, cssSelectorAllowlist);
    if (closestTrackedAncestor) {
      return {
        ...baseEvent,
        closestTrackedAncestor,
        targetElementProperties: getEventProperties(baseEvent.type, closestTrackedAncestor, dataAttributePrefix),
      } as ElementBasedTimestampedEvent<T>;
    }
  }

  return baseEvent;
};
