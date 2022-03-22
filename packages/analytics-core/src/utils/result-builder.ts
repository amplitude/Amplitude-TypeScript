import { Event, Result, Status } from '@amplitude/analytics-types';

export const buildResult = (event: Event, code = 0, message: string = Status.Unknown): Result => {
  return { event, code, message };
};
