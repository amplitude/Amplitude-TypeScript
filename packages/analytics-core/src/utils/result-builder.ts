import { Event } from '../event/event';
import { Result } from '../result';
import { Status } from '../status';

export const buildResult = (event: Event, code = 0, message: string = Status.Unknown): Result => {
  return { event, code, message };
};
