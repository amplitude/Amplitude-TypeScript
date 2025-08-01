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

export interface NetworkCaptureRule {
  /**
   * Hosts to allow for network capture. Supports wildcard.
   * @defaultValue `["*"]` all hosts (except amplitude)
   */
  hosts?: string[];
  /**
   * Paths to allow for network capture. Supports wildcard.
   * @defaultValue `["*"]` all paths
   */
  paths?: string[];
  /**
   * Properties on response JSON to allow for network capture.
   */
  allowResponseBodyKeys?: string[];
  /**
   * Properties on request JSON to allow for network capture.
   */
  allowRequestBodyKeys?: string[];
  /**
   * Headers on response to allow for network capture.
   *
   * When "true", allow capture of all response headers except (case-insensitive):
   *  - "set-cookie"
   *  - "authorization"
   *
   *  By default, no headers are allowed.
   */
  allowResponseHeaders?: boolean | string[];
  /**
   * Headers on request to allow for network capture.
   *
   * When "true", allow capture of all request headers except (case-insensitive):
   *  - "authorization"
   *  - "cookie"
   *  - "x-api-key"
   *  - "x-csrf-token"
   *  - "set-cookie"
   *
   * By default, no headers are allowed.
   */
  allowRequestHeaders?: boolean | string[];
  /**
   * Range list that defines the status codes to be captured.
   * @defaultValue `500-599`
   */
  statusCodeRange?: string;
  /**
   * Threshold for what is classified as a slow request (in seconds).
   * @defaultValue `3`
   */
  // slowThreshold?: number;
}
