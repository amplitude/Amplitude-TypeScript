/** The status of an event. */
export enum Status {
  /** The status could not be determined. */
  Unknown = 'unknown',
  /** The event was skipped due to configuration or callbacks. */
  Skipped = 'skipped',
  /** The event was sent successfully. */
  Success = 'success',
  /** A user or device in the payload is currently rate limited and should try again later. */
  RateLimit = 'rate_limit',
  /** The sent payload was too large to be processed. */
  PayloadTooLarge = 'payload_too_large',
  /** The event could not be processed. */
  Invalid = 'invalid',
  /** A server-side error ocurred during submission. */
  Failed = 'failed',
  /** a server or client side error occuring when a request takes too long and is cancelled */
  Timeout = 'Timeout',
  /** NodeJS runtime environment error.. E.g. disconnected from network */
  SystemError = 'SystemError',
}
