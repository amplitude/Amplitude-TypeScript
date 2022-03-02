import { Status } from '@amplitude/analytics-types';

export function buildStatus(code: number): Status {
  if (code >= 200 && code < 300) {
    return Status.Success;
  }

  if (code === 429) {
    return Status.RateLimit;
  }

  if (code === 413) {
    return Status.PayloadTooLarge;
  }

  if (code === 408) {
    return Status.Timeout;
  }

  if (code >= 400 && code < 500) {
    return Status.Invalid;
  }

  if (code >= 500) {
    return Status.Failed;
  }

  return Status.Unknown;
}
