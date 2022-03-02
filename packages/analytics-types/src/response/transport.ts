interface BaseResponse {
  code: number;
  name: string;
}

export interface SuccessSummary extends BaseResponse {
  name: 'SuccessSummary';
  code: 200;
  eventsIngested: number;
  payloadSizeBytes: number;
  serverUploadTime: number;
}

export interface InvalidRequestError extends BaseResponse {
  name: 'InvalidRequestError';
  code: 400;
  error: string;
  missingField: string;
  eventsWithInvalidFields: Record<string, number[]>;
  eventsWithMissingFields: Record<string, number[]>;
}

export interface PayloadTooLargeError extends BaseResponse {
  name: 'PayloadTooLargeError';
  code: 413;
  error: string;
}

export interface TooManyRequestsForDeviceError extends BaseResponse {
  name: 'TooManyRequestsForDeviceError';
  code: 429;
  error: string;
  epsThreshold: number;
  throttledDevices: Record<string, number>;
  throttledUsers: Record<string, number>;
  throttledEvents: number[];
}

export interface ServerError {
  name: 'ServerError';
  code: 500 | 502 | 504;
}

export interface ServiceUnavailableError {
  name: 'ServiceUnavailableError';
  code: 503;
}

export interface UnexpectedError {
  name: string;
  code: 0;
}

export type TransportResponse =
  | SuccessSummary
  | InvalidRequestError
  | PayloadTooLargeError
  | TooManyRequestsForDeviceError
  | ServiceUnavailableError
  | ServerError
  | UnexpectedError;
