export interface HttpBaseResponse {
  code?: number;
}

export interface HttpSuccessSummary extends HttpBaseResponse {
  code: 200;
  events_ingested?: number;
  payload_size_bytes?: number;
  server_upload_time?: number;
}

export interface HttpInvalidRequestError extends HttpBaseResponse {
  code: 400;
  error?: string;
  missing_field?: string;
  events_with_invalid_fields?: Record<string, number[]>;
  events_with_missing_fields?: Record<string, number[]>;
}

export interface HttpPayloadTooLargeError extends HttpBaseResponse {
  code: 413;
  error?: string;
}

export interface HttpTooManyRequestsForDeviceError extends HttpBaseResponse {
  code: 429;
  error?: string;
  eps_threshold?: number;
  throttled_devices?: Record<string, number>;
  throttled_users?: Record<string, number>;
  throttled_events?: number[];
}

export interface HttpServerError {
  code: 500 | 502 | 504;
}

export interface HttpServiceUnavailableError {
  code: 503;
}

export interface HttpUnknownError {
  code: number;
}

export type HttpResponse =
  | HttpSuccessSummary
  | HttpInvalidRequestError
  | HttpPayloadTooLargeError
  | HttpTooManyRequestsForDeviceError
  | HttpServerError
  | HttpServiceUnavailableError
  | HttpUnknownError;
