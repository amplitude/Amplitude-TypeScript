import { BaseEvent } from '../types/event/base-event';
import { NetworkRequestEventProperties } from '../types/event/network-request-event';
import { parseNetworkRequestUrl } from './network-request-url';

interface NetworkRequestEventData extends Omit<NetworkRequestEventProperties, 'url' | 'startTime' | 'duration'> {
  url: NonNullable<ReturnType<typeof parseNetworkRequestUrl>>;
  startTime?: number;
  completionTime?: number;
  duration?: number;
}

/** @internal Maps already-normalized request data without imposing manual reporting validation. */
export function formatNetworkRequestEvent(properties: NetworkRequestEventData) {
  const eventProperties = {
    '[Amplitude] URL': properties.url.hrefWithoutQueryOrHash,
    '[Amplitude] URL Query': properties.url.query,
    '[Amplitude] URL Fragment': properties.url.fragment,
    '[Amplitude] Request Method': properties.method,
    '[Amplitude] Status Code': properties.statusCode,
    '[Amplitude] Start Time': properties.startTime,
    '[Amplitude] Completion Time': properties.completionTime,
    '[Amplitude] Duration': properties.duration,
    '[Amplitude] Request Body Size': properties.requestBodySize,
    '[Amplitude] Response Body Size': properties.responseBodySize,
    '[Amplitude] Request Type': properties.requestType,
    '[Amplitude] Request Headers': properties.requestHeaders,
    '[Amplitude] Response Headers': properties.responseHeaders,
    ...('requestBody' in properties && { '[Amplitude] Request Body': properties.requestBody }),
    ...('responseBody' in properties && { '[Amplitude] Response Body': properties.responseBody }),
    ...(properties.error && {
      '[Amplitude] Error Code': properties.error.code,
      '[Amplitude] Error Message': properties.error.message,
    }),
  };
  return {
    event_type: '[Amplitude] Network Request',
    event_properties: eventProperties,
  };
}

/**
 * Creates an [Amplitude] Network Request event for a completed request.
 * Pass the returned event to track() on the desired analytics instance when defined.
 * This function does not send events or apply Autocapture filtering or sanitization rules.
 * Callers are responsible for sanitizing the supplied data.
 *
 * Invalid input is logged to the console and produces no event.
 * @returns The event, or undefined for invalid URL, method, or timing values.
 */
export function createNetworkRequestEvent(properties: NetworkRequestEventProperties): BaseEvent | undefined {
  if (
    typeof properties?.url !== 'string' ||
    !properties.url.trim() ||
    typeof properties.method !== 'string' ||
    !properties.method.trim()
  ) {
    console.error('Amplitude Logger [Error]: Network request URL and method must not be empty');
    return;
  }
  const completionTime = properties.startTime + properties.duration;
  if (
    !Number.isFinite(properties.startTime) ||
    properties.startTime < 0 ||
    !Number.isFinite(properties.duration) ||
    properties.duration < 0 ||
    !Number.isFinite(completionTime)
  ) {
    console.error('Amplitude Logger [Error]: Network request timing must be finite, non-negative milliseconds');
    return;
  }
  const event = formatNetworkRequestEvent({
    ...properties,
    url: parseNetworkRequestUrl(properties.url)!,
    statusCode: properties.statusCode ?? 0,
    requestType: properties.requestType ?? 'custom',
    completionTime,
  });
  return {
    ...event,
    event_properties: Object.fromEntries(
      Object.entries(event.event_properties).filter(([, value]) => value !== undefined),
    ),
  };
}
