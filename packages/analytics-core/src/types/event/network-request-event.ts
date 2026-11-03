/** Completed HTTP request metadata used to construct a network analytics event. */
export interface NetworkRequestEventProperties {
  /** Request URL. Query and fragment become separate properties; callers must sanitize sensitive values. */
  url: string;
  /** HTTP request method. */
  method: string;
  /** Request start time in Unix milliseconds. */
  startTime: number;
  /** Elapsed request duration in milliseconds. Completion time is startTime + duration. */
  duration: number;
  /** HTTP response status. Defaults to 0 when no response is available. */
  statusCode?: number;
  /** Defaults to custom for manually reported requests. */
  requestType?: 'xhr' | 'fetch' | 'custom';
  /** Optional transport error, including a numeric native error code when available. */
  error?: { code?: number; message: string };
  /** Request body size in bytes. */
  requestBodySize?: number;
  /** Response body size in bytes. */
  responseBodySize?: number;
  /** Headers to report. Callers must remove sensitive values before passing them. */
  requestHeaders?: Record<string, string>;
  /** Headers to report. Callers must remove sensitive values before passing them. */
  responseHeaders?: Record<string, string>;
  /** Serialized request body. Callers must remove sensitive values before passing it. */
  requestBody?: string;
  /** Serialized response body. Callers must remove sensitive values before passing it. */
  responseBody?: string;
}
