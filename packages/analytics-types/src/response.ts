import { Status } from './status';

/** A response body for a request that returned 200 (successful). */
export interface SuccessBody {
  eventsIngested: number;
  payloadSizeBytes: number;
  serverUploadTime: number;
}

/** A response body for a request that returned 400 (invalid request). */
export interface InvalidRequestBody {
  error: string;
  missingField: string;
  eventsWithInvalidFields: { [eventField: string]: number[] };
  eventsWithMissingFields: { [eventField: string]: number[] };
  epsThreshold: 0;
  exceededDailyQuotaDevices: { [deviceId: string]: number };
  silencedDevices: string[];
  silencedEvents: number[];
  throttledDevices: { [deviceId: string]: number };
  throttledEvents: number[];
}

/** A response body for a request that returned 413 (payload too large). */
export interface PayloadTooLargeBody {
  error?: string;
}

/** A response body for a request that returned 429 (rate limit). */
export interface RateLimitBody {
  error: string;
  epsThreshold: number;
  throttledDevices: { [deviceId: string]: number };
  throttledUsers: { [userId: string]: number };
  exceededDailyQuotaDevices: { [deviceId: string]: number };
  exceededDailyQuotaUsers: { [userId: string]: number };
  throttledEvents: number[];
}

export type StatusWithResponseBody = Status.Invalid | Status.PayloadTooLarge | Status.RateLimit | Status.Success;

/** Represents additional data that is provided by the http v2 API */
export type ResponseBody = SuccessBody | InvalidRequestBody | PayloadTooLargeBody | RateLimitBody;

export type SuccessResponse = {
  status: Status.Success;
  statusCode: number;
  body: SuccessBody;
};

export type InvalidResponse = {
  status: Status.Invalid;
  statusCode: number;
  body: InvalidRequestBody;
};

export type PayloadTooLargeResponse = {
  status: Status.PayloadTooLarge;
  statusCode: number;
  body: PayloadTooLargeBody;
};

export type RateLimitResponse = {
  status: Status.RateLimit;
  statusCode: number;
  body: RateLimitBody;
};

export type TimeoutResponse = {
  status: Status.Timeout;
  statusCode: number;
};

export type SystemErrorResponse = {
  status: Status.SystemError;
  statusCode: 0;
  error: NodeJS.ErrnoException;
};

export type OtherReponse = {
  status: Exclude<Status, StatusWithResponseBody>;
  statusCode: number;
};

/** JSDoc */
export type Response =
  | SuccessResponse
  | InvalidResponse
  | PayloadTooLargeResponse
  | RateLimitResponse
  | TimeoutResponse
  | SystemErrorResponse
  | OtherReponse;
