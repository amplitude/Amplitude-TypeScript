import { Event } from './event';
import { EventCallback } from './event-callback';

export interface DestinationContext {
  event: Event;
  callback: EventCallback;
  attempts: number;
}
