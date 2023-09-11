import { Event, BaseEvent, SpecialEventType, IdentifyEvent } from '@amplitude/analytics-types';

const specialAmplitudeEvents = new Set(Object.values(SpecialEventType));

export const isNotSpecialAmplitudeEvent = (event: Event): event is BaseEvent => {
  return !specialAmplitudeEvents.has(event.event_type as SpecialEventType);
};

export const isAmplitudeIdentifyEvent = (event: Event): event is IdentifyEvent => {
  return event.event_type === SpecialEventType.IDENTIFY;
};
