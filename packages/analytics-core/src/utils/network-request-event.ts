import { BaseEvent } from '../types/event/base-event';
import { NetworkRequestEventProperties } from '../types/event/network-request-event';
import { parseNetworkRequestUrl } from './network-request-url';

/**
 * Creates an [Amplitude] Network Request event for a completed request.
 * Pass the returned event to track() on the desired analytics instance.
 * This function does not send events or apply Autocapture filtering or sanitization rules.
 * Callers are responsible for sanitizing the supplied data.
 *
 * @throws TypeError if the URL or HTTP method is empty.
 * @throws RangeError if timing values are negative or non-finite.
 */
export function createNetworkRequestEvent(properties: NetworkRequestEventProperties): BaseEvent {
  if (!properties.url.trim() || !properties.method.trim()) {
    throw new TypeError('Network request URL and method must not be empty');
  }
  const completionTime = properties.startTime + properties.duration;
  if (
    !Number.isFinite(properties.startTime) ||
    properties.startTime < 0 ||
    !Number.isFinite(properties.duration) ||
    properties.duration < 0 ||
    !Number.isFinite(completionTime)
  ) {
    throw new RangeError('Network request timing must be finite, non-negative milliseconds');
  }
  const url = parseNetworkRequestUrl(properties.url)!;
  const eventProperties = {
    '[Amplitude] URL': url.hrefWithoutQueryOrHash,
    '[Amplitude] URL Query': url.query,
    '[Amplitude] URL Fragment': url.fragment,
    '[Amplitude] Request Method': properties.method,
    '[Amplitude] Status Code': properties.statusCode ?? 0,
    '[Amplitude] Start Time': properties.startTime,
    '[Amplitude] Completion Time': completionTime,
    '[Amplitude] Duration': properties.duration,
    '[Amplitude] Request Type': properties.requestType ?? 'custom',
    '[Amplitude] Error Code': properties.error?.code,
    '[Amplitude] Error Message': properties.error?.message,
    '[Amplitude] Request Body Size': properties.requestBodySize,
    '[Amplitude] Response Body Size': properties.responseBodySize,
    '[Amplitude] Request Headers': properties.requestHeaders,
    '[Amplitude] Response Headers': properties.responseHeaders,
    '[Amplitude] Request Body': properties.requestBody,
    '[Amplitude] Response Body': properties.responseBody,
  };
  return {
    event_type: '[Amplitude] Network Request',
    event_properties: Object.fromEntries(Object.entries(eventProperties).filter(([, value]) => value !== undefined)),
  };
}
