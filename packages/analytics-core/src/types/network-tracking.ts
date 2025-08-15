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

// export interface BodyCaptureRule {
//   // TODO: Change this to whatever is the settled configuration name before merging
//   /**
//    * List of JSON pointers to capture from a request or response body (JSON objects only)
//    *
//    * If this is empty or undefined, no attributes are captured
//    *
//    * Follows a syntax similar to JSON Pointer, except:
//    * - The leading / is optional
//    * - A wildcard * can be used to match any key
//    * - A wildcard ** can be used to match any number of keys (or no keys)
//    * - The structure of the JSON is preserved (ie: the captured body is a subset of the original body)
//    */
//   allowlist?: string[];
//   /**
//    * List of JSON pointers to exclude from a request or response body (JSON objects only)
//    *
//    * This "uncaptures" any attributes that are captured by the allowlist.
//    */
//   blocklist?: string[];
// }

export interface HeaderCaptureRule {
  /**
   * List of headers to allow for network capture. Exact match only.
   * @defaultValue `[]` no headers
   */
  allowlist?: string[];
  /**
   * Capture all [Safe Headers](https://github.com/amplitude/Amplitude-TypeScript/blob/main/packages/analytics-core/src/constants.ts)
   *
   * If true, these safe headers will all be captured automatically.
   * // TODO: Determine if we actually want this to be default false
   * @defaultValue `false`
   */
  captureSafeHeaders?: boolean;
}

export interface NetworkCaptureRule {
  /**
   * Hosts to allow for network capture. Supports wildcard.
   * @defaultValue `["*"]` all hosts (except amplitude)
   */
  hosts?: string[];
  /**
   * URL patterns to allow for network capture. Supports wildcard.
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
   * Determines what to capture from the response headers.
   * @experimental This feature is experimental and may not be stable
   */
  responseHeaders?: HeaderCaptureRule;
  /**
   * Determines what to capture from the request headers.
   * @experimental This feature is experimental and may not be stable
   */
  requestHeaders?: HeaderCaptureRule;
  /**
   * Determines what to capture from the response body.
   * @experimental This feature is experimental and may not be stable
   */
  // responseBody?: BodyCaptureRule;
  /**
   * Determines what to capture from the request body.
   * @experimental This feature is experimental and may not be stable
   */
  // requestBody?: BodyCaptureRule;
  /**
   * Threshold   for what is classified as a slow request (in seconds).
   * @defaultValue `3`
   */
  // slowThreshold?: number;
}
