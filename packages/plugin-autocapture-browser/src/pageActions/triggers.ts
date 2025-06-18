import { Trigger } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
// Return which labeled events, if any, the element matches
import type { LabeledEvent } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import { ElementBasedTimestampedEvent, ElementBasedEvent } from 'src/helpers';
import { matchEventToFilter } from './matchEventToFilter';

// groups labeled events by event type
// skips any labeled events with malformed definitions or unexpected event_type
export const groupLabeledEventIdsByEventType = (labeledEvents?: LabeledEvent[] | null) => {
  const groupedLabeledEvents = {
    click: new Set<string>(),
    change: new Set<string>(),
  };
  if (!labeledEvents) {
    return groupedLabeledEvents;
  }

  for (const le of labeledEvents) {
    try {
      for (const def of le.definition) {
        groupedLabeledEvents[def.event_type]?.add(le.id);
      }
    } catch (e) {
      // Skip this labeled event if there is an error
      console.warn('Skipping Labeled Event due to malformed definition', le?.id, e);
    }
  }
  return groupedLabeledEvents;
};

// TODO: add tests
export const createLabeledEventToTriggerMap = (triggers: Trigger[]) => {
  const labeledEventToTriggerMap = new Map<string, Trigger[]>();
  for (const trigger of triggers) {
    for (const condition of trigger.conditions) {
      if (condition.type === 'LABELED_EVENT') {
        const eventId = condition.match.eventId;
        // Get existing triggers for this event ID or initialize empty array
        let existingTriggers = labeledEventToTriggerMap.get(eventId);
        if (!existingTriggers) {
          existingTriggers = [];
          labeledEventToTriggerMap.set(eventId, existingTriggers);
        }
        // Add current trigger to the list of triggers for this event ID
        existingTriggers.push(trigger);
      }
    }
  }
  return labeledEventToTriggerMap;
};

/**
 * Matches an event to labeled events based on the event's properties.
 * The logic matches exactly what is supported by the query backend.
 * TODO: later pre-filter the labeled events based on URL first
 *
 * @param event - The event to match against labeled events
 * @param labeledEvents - Array of labeled events to match against
 * @returns Array of matching labeled events
 */
export const matchEventToLabeledEvents = (
  event: ElementBasedTimestampedEvent<ElementBasedEvent>,
  labeledEvents: LabeledEvent[],
) => {
  return labeledEvents.filter((le) => {
    return le.definition.some((def) => {
      return def.event_type === event.type && def.filters.every((filter) => matchEventToFilter(event, filter));
    });
  });
};

export const matchLabeledEventsToTriggers = (labeledEvents: LabeledEvent[], leToTriggerMap: Map<string, Trigger[]>) => {
  const matchingTriggers = new Set<Trigger>();
  for (const le of labeledEvents) {
    const triggers = leToTriggerMap.get(le.id);
    if (triggers) {
      triggers.forEach((trigger) => matchingTriggers.add(trigger));
    }
  }
  return Array.from(matchingTriggers);
};
