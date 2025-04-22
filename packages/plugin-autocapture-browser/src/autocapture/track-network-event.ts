import {
  BrowserClient,
  BrowserConfig,
  NetworkRequestEvent,
  NetworkCaptureRule,
  NetworkTrackingOptions,
} from '@amplitude/analytics-core';
import { filter } from 'rxjs';
import { AllWindowObservables, TimestampedEvent } from '../autocapture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT } from '../constants';

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

export function shouldTrackNetworkEvent(networkEvent: NetworkRequestEvent, options: NetworkTrackingOptions = {}) {
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
    [...options.captureRules].reverse().find((rule) => {
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
  ['[Amplitude] URL']: string;
  ['[Amplitude] URL Query']?: string;
  ['[Amplitude] URL Fragment']?: string;
  ['[Amplitude] Request Method']: string;
  ['[Amplitude] Status Code']?: number;
  ['[Amplitude] Start Time']?: number; // unix timestamp
  ['[Amplitude] Completion Time']?: number; // unix timestamp
  ['[Amplitude] Duration']?: number; // completionTime - startTime
  ['[Amplitude] Request Body Size']?: number;
  ['[Amplitude] Response Body Size']?: number;
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
      return shouldTrackNetworkEvent(event.event as NetworkRequestEvent, config.networkTrackingOptions);
    }),
  );

  return filteredNetworkObservable.subscribe((networkEvent) => {
    const request = networkEvent.event as NetworkRequestEvent;

    // convert to NetworkAnalyticsEvent
    let url, urlQuery, urlFragment;
    try {
      url = new URL(request.url);
      urlQuery = url.searchParams.toString();
      urlFragment = url.hash.replace('#', '');
    } catch (e) {
      // if the URL failed to parse, just use the original URL
      // and do not include the query or fragment
    }

    const networkAnalyticsEvent: NetworkAnalyticsEvent = {
      ['[Amplitude] URL']: request.url,
      ['[Amplitude] URL Query']: urlQuery,
      ['[Amplitude] URL Fragment']: urlFragment,
      ['[Amplitude] Request Method']: request.method,
      ['[Amplitude] Status Code']: request.status,
      ['[Amplitude] Start Time']: request.startTime,
      ['[Amplitude] Completion Time']: request.endTime,
      ['[Amplitude] Duration']: request.duration,
      ['[Amplitude] Request Body Size']: request.requestBodySize,
      ['[Amplitude] Response Body Size']: request.responseBodySize,
    };

    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_NETWORK_REQUEST_EVENT, networkAnalyticsEvent);
  });
}
