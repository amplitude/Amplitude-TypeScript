import { BrowserClient, BrowserConfig, NetworkRequestEvent } from '@amplitude/analytics-core';
import { NetworkCaptureRule, NetworkTrackingOptions } from '@amplitude/analytics-core/lib/esm/types/network-tracking';
import { filter } from 'rxjs';
import { AllWindowObservables, TimestampedEvent } from '../autocapture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT } from '../constants';

const DEFAULT_STATUS_CODE_RANGE = '500-599';

// TODO: consider moving this to a shared util
// TODO: make this match properly
function wildcardMatch(str: string, pattern: string) {
  // TODO: clarify how matching should work
  //   e.g.) does api.amplitude.com match amplitude.com?
  //   e.g.) does *amplitude.com match amplitude.com?
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

function isCaptureRuleMatch(rule: NetworkCaptureRule, hostname: string, status?: number) {
  // check if the host is in the allowed hosts
  if (rule.hosts && !rule.hosts.find((host) => wildcardMatch(hostname, host))) {
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

export function shouldTrackNetworkEvent(networkEvent: NetworkRequestEvent, options: NetworkTrackingOptions) {
  const url = new URL(networkEvent.url);
  const host = url.hostname;

  // false if is amplitude request and not configured to track amplitude requests
  if (
    options.ignoreAmplitudeRequests !== false &&
    (wildcardMatch(host, '*.amplitude.com') || wildcardMatch(host, 'amplitude.com'))
  ) {
    return false;
  }

  // false if the host is in the ignore list
  if (options.ignoreHosts?.find((ignoreHost) => wildcardMatch(host, ignoreHost))) {
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
    options.captureRules.reverse().find((rule) => {
      isMatch = isCaptureRuleMatch(rule, host, networkEvent.status);
      return isMatch !== undefined;
    });

    // if we found a miss (false) or no match (undefined),
    // then do not track the event
    if (!isMatch) {
      return false;
    }
  }

  return true;
}

export type NetworkAnalyticsEvent = {
  url: string;
  urlQuery?: string;
  urlFragment?: string;
  method: string;
  statusCode?: number;
  startTime?: number; // unix timestamp
  completionTime?: number; // unix timestamp
  duration?: number; // completionTime - startTime
  requestBodySize?: number;
  responseBodySize?: number;
};

export function trackNetworkEvents({
  allObservables,
  config,
  amplitude,
}: {
  allObservables: AllWindowObservables;
  config: BrowserConfig;
  amplitude: BrowserClient;
}) {
  const { networkObservable } = allObservables;

  const filteredNetworkObservable = networkObservable.pipe(
    filter((event: TimestampedEvent<NetworkRequestEvent>) => {
      // Only track network events that should be tracked,
      return shouldTrackNetworkEvent(event.event as NetworkRequestEvent, config.networkTrackingOptions || {});
    }),
  );

  return filteredNetworkObservable.subscribe((networkEvent) => {
    const request = networkEvent.event as NetworkRequestEvent;

    // convert to NetworkAnalyticsEvent
    const url = new URL(request.url);
    const urlQuery = url.searchParams.toString();
    const urlFragment = url.hash;
    const networkAnalyticsEvent: NetworkAnalyticsEvent = {
      url: request.url,
      urlQuery,
      urlFragment,
      method: request.method,
      statusCode: request.status,
      startTime: request.startTime,
      completionTime: request.endTime,
      duration: request.duration,
      requestBodySize: request.requestBodySize,
      responseBodySize: request.responseBodySize,
    };

    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_NETWORK_REQUEST_EVENT, networkAnalyticsEvent);
  });
}
