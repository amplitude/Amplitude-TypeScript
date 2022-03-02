import { Result as IResult } from '@amplitude/analytics-types';

export class Result implements IResult {
  constructor(public success = false, public code = 0, public message = '') {}
}
