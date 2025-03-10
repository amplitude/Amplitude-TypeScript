import { Event } from '../event/event';

export interface Result {
  event: Event;
  code: number;
  message: string;
}
