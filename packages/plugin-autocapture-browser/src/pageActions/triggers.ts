import type { Trigger } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
// Return which labeled events, if any, the element matches
import type {
  ElementInteractionsOptions,
  LabeledEvent,
} from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import type { ElementBasedTimestampedEvent, ElementBasedEvent } from 'src/helpers';
import { matchEventToFilter } from './matchEventToFilter';
import { executeActions } from './actions';
import type { DataExtractor } from '../data-extractor';

const eventTypeToBrowserEventMap = {
  '[Amplitude] Element Clicked': 'click',
  '[Amplitude] Element Changed': 'change',
} as const;
// groups labeled events by event type
// skips any labeled events with malformed definitions or unexpected event_type
export const groupLabeledEventIdsByEventType = (labeledEvents: LabeledEvent[] | null | undefined) => {
  // Initialize all event types with empty sets
  const groupedLabeledEvents = Object.values(eventTypeToBrowserEventMap).reduce((acc, browserEvent) => {
    acc[browserEvent] = new Set<string>();
    return acc;
  }, {} as Record<string, Set<string>>);

  // If there are no labeled events, return the initialized groupedLabeledEvents
  if (!labeledEvents) {
    return groupedLabeledEvents;
  }

  // Group labeled events by event type
  for (const le of labeledEvents) {
    try {
      for (const def of le.definition) {
        const browserEvent = eventTypeToBrowserEventMap[def.event_type];
        if (browserEvent) {
          groupedLabeledEvents[browserEvent].add(le.id);
        }
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
      return (
        eventTypeToBrowserEventMap[def.event_type] === event.type &&
        def.filters.every((filter) => matchEventToFilter(event, filter))
      );
    });
  });
};

export const matchLabeledEventsToTriggers = (labeledEvents: LabeledEvent[], leToTriggerMap: Map<string, Trigger[]>) => {
  const matchingTriggers = new Set<Trigger>();
  for (const le of labeledEvents) {
    const triggers = leToTriggerMap.get(le.id);
    if (triggers) {
      for (const trigger of triggers) {
        matchingTriggers.add(trigger);
      }
    }
  }
  return Array.from(matchingTriggers);
};

export class TriggerEvaluator {
  constructor(
    private groupedLabeledEvents: ReturnType<typeof groupLabeledEventIdsByEventType>,
    private labeledEventToTriggerMap: ReturnType<typeof createLabeledEventToTriggerMap>,
    private dataExtractor: DataExtractor,
    private options: ElementInteractionsOptions,
  ) {}

  evaluate(event: ElementBasedTimestampedEvent<ElementBasedEvent>) {
    // If there is no pageActions, return the event as is
    const { pageActions } = this.options;
    if (!pageActions) {
      return event;
    }

    // Find matching labeled events
    const matchingLabeledEvents = matchEventToLabeledEvents(
      event,
      Array.from(this.groupedLabeledEvents[event.type]).map((id) => pageActions.labeledEvents[id]),
    );
    // Find matching conditions
    const matchingTriggers = matchLabeledEventsToTriggers(matchingLabeledEvents, this.labeledEventToTriggerMap);
    for (const trigger of matchingTriggers) {
      executeActions(trigger.actions, event, this.dataExtractor);
    }

    return event;
  }

  update(
    groupedLabeledEvents: ReturnType<typeof groupLabeledEventIdsByEventType>,
    labeledEventToTriggerMap: ReturnType<typeof createLabeledEventToTriggerMap>,
    options: ElementInteractionsOptions,
  ) {
    this.groupedLabeledEvents = groupedLabeledEvents;
    this.labeledEventToTriggerMap = labeledEventToTriggerMap;
    this.options = options;
  }
}

export const createTriggerEvaluator = (
  groupedLabeledEvents: ReturnType<typeof groupLabeledEventIdsByEventType>,
  labeledEventToTriggerMap: ReturnType<typeof createLabeledEventToTriggerMap>,
  dataExtractor: DataExtractor,
  options: ElementInteractionsOptions,
) => {
  return new TriggerEvaluator(groupedLabeledEvents, labeledEventToTriggerMap, dataExtractor, options);
};
