import { Event, BaseEvent, SpecialEventType } from "@amplitude/analytics-types"

const specialAmplitudeEvents = new Set(Object.values(SpecialEventType));

export const isSpecialAmplitudeEvent = (event: Event): event is BaseEvent => {
    return specialAmplitudeEvents.has(event.event_type as SpecialEventType);
}