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
   * Keys to allow in the request/response body.
   */
  // TODO: Change this to whatever is the settled configuration name before merging
  allowlist?: string[];
  /**
   * Keys to block in the request/response body.
   */
  // TODO: Change this to whatever is the settled configuration name before merging
  blocklist?: string[];
}

export interface NetworkCaptureRule {
  /**
   * Hosts to allow for network capture. Supports wildcard.
   * @defaultValue `["*"]` all hosts (except amplitude)
   */
  hosts?: string[];
  /**
   * Range list that defines the status codes to be captured.
   * @defaultValue `500-599`
   */
  statusCodeRange?: string;
  /**
   * Determines what to capture from the response body.
   */
  responseBody?: BodyCaptureRule;
  /**
   * Determines what to capture from the request body.
   */
  requestBody?: BodyCaptureRule;
  /**
   * Threshold   for what is classified as a slow request (in seconds).
   * @defaultValue `3`
   */
  // slowThreshold?: number;
}
