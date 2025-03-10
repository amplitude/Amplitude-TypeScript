import { Event } from '../types/event/event';
import { Result } from '../types/result';
import { Status } from '../types/status';

export const buildResult = (event: Event, code = 0, message: string = Status.Unknown): Result => {
  return { event, code, message };
};
