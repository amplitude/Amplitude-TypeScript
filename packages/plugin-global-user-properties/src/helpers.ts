import { Event, TrackEvent, SpecialEventType, IdentifyEvent } from '@amplitude/analytics-types';

const specialAmplitudeEvents = new Set(Object.values(SpecialEventType));

export const isTrackEvent = (event: Event): event is TrackEvent => {
  return !specialAmplitudeEvents.has(event.event_type as SpecialEventType);
};

export const isAmplitudeIdentifyEvent = (event: Event): event is IdentifyEvent => {
  return event.event_type === SpecialEventType.IDENTIFY;
};
