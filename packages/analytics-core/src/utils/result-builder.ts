import { Result, Status } from '@amplitude/analytics-types';

export const buildResult = (statusCode = 0, status: Status = Status.Unknown): Result => {
  return { statusCode, status };
};
