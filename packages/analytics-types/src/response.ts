import { Status } from './status';

export interface SuccessBody {
  eventsIngested: number;
  payloadSizeBytes: number;
  serverUploadTime: number;
}

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
export interface PayloadTooLargeBody {
  error?: string;
}
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

export type ResponseBody = SuccessBody | InvalidRequestBody | PayloadTooLargeBody | RateLimitBody;

export interface SuccessResponse {
  status: Status.Success;
  statusCode: number;
  body: SuccessBody;
}

export interface InvalidResponse {
  status: Status.Invalid;
  statusCode: number;
  body: InvalidRequestBody;
}

export interface PayloadTooLargeResponse {
  status: Status.PayloadTooLarge;
  statusCode: number;
  body: PayloadTooLargeBody;
}

export interface RateLimitResponse {
  status: Status.RateLimit;
  statusCode: number;
  body: RateLimitBody;
}

export interface TimeoutResponse {
  status: Status.Timeout;
  statusCode: number;
}

export interface SystemErrorResponse {
  status: Status.SystemError;
  statusCode: 0;
  error: NodeJS.ErrnoException;
}

export interface OtherReponse {
  status: Exclude<Status, StatusWithResponseBody>;
  statusCode: number;
}

export type Response =
  | SuccessResponse
  | InvalidResponse
  | PayloadTooLargeResponse
  | RateLimitResponse
  | TimeoutResponse
  | SystemErrorResponse
  | OtherReponse;
