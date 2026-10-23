import {
  BrowserClient,
  NetworkRequestEvent,
  NetworkCaptureRule,
  NetworkTrackingOptions,
  createNetworkRequestEvent,
  NetworkRequestEventProperties,
  parseNetworkRequestUrl as parseUrl,
  isUrlMatchAllowlist,
  SAFE_HEADERS,
  ILogger,
  IRequestWrapper,
  Unsubscribable,
} from '@amplitude/analytics-core';
import { AllWindowObservables, TimestampedEvent } from './network-capture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT, IS_HEADER_CAPTURE_EXPERIMENTAL } from './constants';
import type { BodyCaptureRule } from '@amplitude/analytics-core';

const DEFAULT_STATUS_CODE_RANGE = '500-599';

function wildcardMatch(str: string, pattern: string) {
  // Escape all regex special characters except for *
  const escapedPattern = pattern.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&');
  // Replace * with .*
  const regexPattern = '^' + escapedPattern.replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexPattern);
  return regex.test(str);
}

function isStatusCodeInRange(statusCode: number, range: string) {
  const ranges = range.split(',');
  for (const r of ranges) {
    const [start, end] = r.split('-').map(Number);
    if (statusCode === start && end === undefined) {
      return true;
    }
    if (statusCode >= start && statusCode <= end) {
      return true;
    }
  }
  return false;
}

function isCaptureRuleMatch(
  rule: NetworkCaptureRule,
  hostname: string,
  status?: number,
  url?: string,
  method?: string,
) {
  // check if the host is in the allowed hosts
  if (rule.hosts && !rule.hosts.find((host: string) => wildcardMatch(hostname, host))) {
    return;
  }

  // check if the URL is in the allowed URL patterns
  if (url && rule.urls && !isUrlMatchAllowlist(url, rule.urls)) {
    return;
  }

  // check if the method is in the allowed methods
  if (
    method &&
    rule.methods &&
    !rule.methods.find(
      (allowedMethod: string) => method.toLowerCase() === allowedMethod.toLowerCase() || allowedMethod === '*',
    )
  ) {
    return;
  }

  // check if the status code is in the allowed range
  if (status || status === 0) {
    const statusCodeRange = rule.statusCodeRange || DEFAULT_STATUS_CODE_RANGE;
    if (!isStatusCodeInRange(status, statusCodeRange)) {
      return false;
    }
  }

  return true;
}

function isAmplitudeNetworkRequestEvent(host: string, requestWrapper: IRequestWrapper): boolean {
  if (host.includes('amplitude.com')) {
    try {
      const body = requestWrapper.body;
      if (typeof body !== 'string') {
        return false;
      }
      const bodyObj = JSON.parse(body) as { events: any[] };
      const { events } = bodyObj;
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-member-access */
      if (events.find((event: any) => event.event_type === AMPLITUDE_NETWORK_REQUEST_EVENT)) {
        return true;
      }
    } catch (e) {
      // do nothing
    }
  }
  return false;
}

/**
 * Takes a user provided header capture rule and returns a
 * HeaderCaptureRule object that sets proper default values.
 *
 * @param rule - The header capture rule to parse.
 * @returns A HeaderCaptureRule object.
 */
export function parseHeaderCaptureRule(rule: string[] | boolean | undefined | null): string[] | undefined {
  if (typeof rule !== 'object' || rule === null) {
    // if rule is truthy or undefined, return SAFE_HEADERS
    if (rule) {
      return [...SAFE_HEADERS];
    } else if (rule === undefined) {
      /* istanbul ignore next */
      const res = IS_HEADER_CAPTURE_EXPERIMENTAL ? undefined : [...SAFE_HEADERS];
      return res;
    }
    return;
  }

  // if the rule is defined but empty, return undefined
  if (rule.length === 0) {
    return;
  }

  return rule;
}

function isBodyCaptureRuleEmpty(rule: BodyCaptureRule) {
  /* istanbul ignore next */
  return !rule?.allowlist?.length && !rule?.blocklist?.length && !rule?.excludelist?.length;
}

export function shouldTrackNetworkEvent(networkEvent: NetworkRequestEvent, options: NetworkTrackingOptions = {}) {
  if (!networkEvent.url) {
    return false;
  }
  const urlObj = parseUrl(networkEvent.url);
  const { host } = urlObj;

  // false if is amplitude request and not configured to track amplitude requests
  if (
    options.ignoreAmplitudeRequests !== false &&
    (wildcardMatch(host, '*.amplitude.com') || wildcardMatch(host, 'amplitude.com'))
  ) {
    return false;
  }

  // false if the host is in the ignore list
  if (options.ignoreHosts?.find((ignoreHost: string) => wildcardMatch(host, ignoreHost))) {
    return false;
  }

  // false if the status code is not 500-599 and there are no captureRules
  if (
    !options.captureRules &&
    networkEvent.status !== undefined &&
    !isStatusCodeInRange(networkEvent.status, DEFAULT_STATUS_CODE_RANGE)
  ) {
    return false;
  }

  if (options.captureRules) {
    // find the first capture rule, in reverse-order,
    // that is a match (true) or a miss (false)
    let isMatch: boolean | undefined;
    [...options.captureRules].reverse().find((rule) => {
      isMatch = isCaptureRuleMatch(rule, host, networkEvent.status, networkEvent.url, networkEvent.method);

      if (isMatch) {
        const responseHeadersRule = parseHeaderCaptureRule(rule.responseHeaders);
        if (networkEvent.responseWrapper && responseHeadersRule) {
          const responseHeaders = networkEvent.responseWrapper.headers(responseHeadersRule);
          if (responseHeaders) {
            networkEvent.responseHeaders = responseHeaders;
          }
        }

        // if requestHeaders rule is specified, enrich the event with the request headers
        const requestHeadersRule = parseHeaderCaptureRule(rule.requestHeaders);
        if (networkEvent.requestWrapper && requestHeadersRule) {
          const requestHeaders = networkEvent.requestWrapper.headers(requestHeadersRule);
          if (requestHeaders) {
            networkEvent.requestHeaders = requestHeaders;
          }
        }

        // if responseBody rule is specified, enrich the event with the response body
        if (networkEvent.responseWrapper && rule.responseBody && !isBodyCaptureRuleEmpty(rule.responseBody)) {
          const excludelist = rule.responseBody.excludelist || rule.responseBody.blocklist;
          networkEvent.responseBodyJson = networkEvent.responseWrapper.json(rule.responseBody.allowlist, excludelist);
        }

        // if requestBody rule is specified, enrich the event with the request body
        if (networkEvent.requestWrapper && rule.requestBody && !isBodyCaptureRuleEmpty(rule.requestBody)) {
          const excludelist = rule.requestBody.excludelist || rule.requestBody.blocklist;
          networkEvent.requestBodyJson = networkEvent.requestWrapper.json(rule.requestBody.allowlist, excludelist);
        }
      }

      return isMatch !== undefined;
    });

    // if we found a miss (false) or no match (undefined),
    // then do not track the event
    if (!isMatch) {
      return false;
    }
  }

  // skip Amplitude network requests to "[Amplitude] Network Request" to avoid infinite loop
  if (networkEvent.requestWrapper && isAmplitudeNetworkRequestEvent(host, networkEvent.requestWrapper)) {
    return false;
  }

  return true;
}

export async function logNetworkAnalyticsEvent(
  request: NetworkRequestEvent,
  amplitude: BrowserClient,
  loggerProvider?: ILogger,
) {
  if (!request.url) {
    return;
  }
  const properties: NetworkRequestEventProperties = {
    url: request.url,
    method: request.method,
    statusCode: request.status,
    startTime: request.startTime,
    duration: request.duration ?? 0,
    requestType: request.type,
    error: request.error,
    requestBodySize: request.requestWrapper?.bodySize,
    responseBodySize: request.responseWrapper?.bodySize,
    requestHeaders: request.requestHeaders,
    responseHeaders: request.responseHeaders,
  };
  if (request.requestBodyJson || request.responseBodyJson) {
    const [requestBody, responseBody] = await Promise.all([request.requestBodyJson, request.responseBodyJson]);
    if (requestBody) {
      try {
        properties.requestBody = JSON.stringify(requestBody);
      } catch (e) {
        /* istanbul ignore next */
        loggerProvider?.debug('Failed to stringify request body', e);
      }
    }
    if (responseBody) {
      try {
        properties.responseBody = JSON.stringify(responseBody);
      } catch (e) {
        /* istanbul ignore next */
        loggerProvider?.debug('Failed to stringify response body');
      }
    }
  }
  /* istanbul ignore next */
  amplitude?.track(createNetworkRequestEvent(properties));
}

export function trackNetworkEvents({
  allObservables,
  networkTrackingOptions,
  amplitude,
  loggerProvider,
}: {
  allObservables: AllWindowObservables;
  networkTrackingOptions: NetworkTrackingOptions;
  amplitude: BrowserClient;
  loggerProvider?: ILogger;
}): Unsubscribable {
  const { networkObservable } = allObservables;

  const filteredNetworkObservable = networkObservable.filter((event: TimestampedEvent<NetworkRequestEvent>) => {
    // Only track network events that should be tracked
    return shouldTrackNetworkEvent(event.event as NetworkRequestEvent, networkTrackingOptions);
  });

  return filteredNetworkObservable.subscribe((networkEvent) => {
    const request = networkEvent.event;

    // fire-and-forget promise that tracks the event
    void logNetworkAnalyticsEvent(request, amplitude, loggerProvider);
  });
}
