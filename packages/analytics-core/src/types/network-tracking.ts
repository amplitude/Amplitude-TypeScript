export interface NetworkTrackingOptions {
  /**
   * Suppresses tracking Amplitude requests from network capture.
   * @defaultValue `true`
   */
  ignoreAmplitudeRequests?: boolean;
  /**
   * Hosts to ignore for network capture. Supports wildcard.
   * @defaultValue `[]`
   */
  ignoreHosts?: string[];
  /**
   * Rules to determine which network requests should be captured.
   *
   * Performs matching on array in reverse order.
   */
  captureRules?: NetworkCaptureRule[];
}

export interface BodyCaptureRule {
  /**
   * List of JSON pointers to capture from a request or response body (JSON objects only)
   *
   * Includes nothing, by default.
   * Any keys defined in excludelist will be excluded from the capture.
   *
   * Follows a syntax similar to [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901), except:
   * - The leading / is optional
   * - A wildcard * can be used to match any key
   * - A double-wildcard ** can be used to match any number of keys (or no keys)
   * - The structure of the JSON is preserved (ie: the captured body is a subset of the original body)
   */
  allowlist?: string[];
  /**
   * List of JSON pointers to exclude from a request or response body (JSON objects only)
   *
   * This "uncaptures" any attributes that are captured by the allowlist.
   */
  blocklist?: string[];
}

export interface NetworkCaptureRule {
  /**
   * Hosts to allow for network capture. Supports wildcard.
   * @defaultValue `["*"]` all hosts (except amplitude)
   */
  hosts?: string[];
  /**
   * URL patterns to allow for network capture. Supports wildcard.
   *
   * This takes precedence over `hosts`
   * @experimental This feature is experimental and may not be stable
   * @defaultValue `["*"]` all URLs
   */
  urls?: (string | RegExp)[];
  /**
   * Methods to allow for network capture.
   * @defaultValue `["*"]` all methods
   */
  methods?: string[];
  /**
   * Range list that defines the status codes to be captured.
   * @defaultValue `500-599`
   */
  statusCodeRange?: string;
  /**
   * Capture headers from network response.
   *
   * If true, SAFE_HEADERS are captured. If false, no headers are captured.
   * If a string array, the headers in the array are captured.
   *
   * @experimental This feature is experimental and may not be stable
   * @defaultValue `false`
   */
  responseHeaders?: string[] | boolean;
  /**
   * Capture headers from network request.
   *
   * If true, SAFE_HEADERS are captured. If false, no headers are captured.
   * If a string array, the headers in the array are captured.
   *
   * @experimental This feature is experimental and may not be stable
   * @defaultValue `false`
   */
  requestHeaders?: string[] | boolean;
  /**
   * Determines what to capture from the response body.
   * @experimental This feature is experimental and may not be stable
   */
  responseBody?: BodyCaptureRule;
  /**
   * Determines what to capture from the request body.
   * @experimental This feature is experimental and may not be stable
   */
  requestBody?: BodyCaptureRule;
  /**
   * Threshold   for what is classified as a slow request (in seconds).
   * @defaultValue `3`
   */
  // slowThreshold?: number;
}
