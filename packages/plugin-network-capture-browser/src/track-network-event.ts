import {
  BrowserClient,
  NetworkRequestEvent,
  NetworkCaptureRule,
  NetworkTrackingOptions,
  getGlobalScope,
} from '@amplitude/analytics-core';
import { filter } from 'rxjs';
import { AllWindowObservables, TimestampedEvent } from './network-capture-plugin';
import { AMPLITUDE_NETWORK_REQUEST_EVENT } from './constants';

export type FetchRequestBody = string | Blob | ArrayBuffer | FormDataBrowser | URLSearchParams | null | undefined;
// using this type instead of the DOM's ttp so that it's Node compatible
type FormDataEntryValueBrowser = string | Blob | null;
export interface FormDataBrowser {
  entries(): IterableIterator<[string, FormDataEntryValueBrowser]>;
}

const DEFAULT_STATUS_CODE_RANGE = '500-599';
const MAXIMUM_ENTRIES = 100;

export function calculateResponseBodySize(responseHeaders: Headers) {
  const contentLength = responseHeaders.get('content-length');
  return contentLength ? parseInt(contentLength, 10) : undefined;
}

export function getRequestBodyLength(body: FetchRequestBody | null | undefined): number | undefined {
  const global = getGlobalScope();
  if (!global?.TextEncoder) {
    return;
  }
  const { TextEncoder } = global;

  if (typeof body === 'string') {
    return new TextEncoder().encode(body).length;
  } else if (body instanceof Blob) {
    return body.size;
  } else if (body instanceof URLSearchParams) {
    return new TextEncoder().encode(body.toString()).length;
  } else if (body instanceof ArrayBuffer) {
    return body.byteLength;
  } else if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  } else if (body instanceof FormData) {
    // Estimating only for text parts; not accurate for files
    const formData = body as FormDataBrowser;

    let total = 0;
    let count = 0;
    for (const [key, value] of formData.entries()) {
      total += key.length;
      if (typeof value === 'string') {
        total += new TextEncoder().encode(value).length;
      } else if ((value as Blob).size) {
        // if we encounter a "File" type, we should not count it and just return undefined
        total += (value as Blob).size;
      }
      // terminate if we reach the maximum number of entries
      // to avoid performance issues in case of very large FormDataß
      if (++count >= MAXIMUM_ENTRIES) {
        return;
      }
    }
    return total;
  }
  // Stream or unknown
  return;
}

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
  if (rule.hosts && !rule.hosts.find((host: string) => wildcardMatch(hostname, host))) {
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

function parseUrl(url: string | undefined) {
  if (!url) {
    return;
  }
  try {
    /* istanbul ignore next */
    const currentHref = getGlobalScope()?.location.href;
    const urlObj = new URL(url, currentHref);
    const query = urlObj.searchParams.toString();
    const fragment = urlObj.hash.replace('#', '');
    const href = urlObj.href;
    const host = urlObj.host;
    urlObj.hash = '';
    urlObj.search = '';
    const hrefWithoutQueryOrHash = urlObj.href;
    return { query, fragment, href, hrefWithoutQueryOrHash, host };
  } catch (e) {
    /* istanbul ignore next */
    return;
  }
}

export function shouldTrackNetworkEvent(networkEvent: NetworkRequestEvent, options: NetworkTrackingOptions = {}) {
  const urlObj = parseUrl(networkEvent.url);
  /* istanbul ignore if */
  if (!urlObj) {
    // if the URL failed to parse, do not track the event
    // this is a probably impossible case that would only happen if the URL is malformed
    /* istanbul ignore next */
    return false;
  }
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
  ['[Amplitude] Duration']?: number; // completionTime - startTime (millis)
  ['[Amplitude] Request Body Size']?: number;
  ['[Amplitude] Response Body Size']?: number;
};

export function trackNetworkEvents({
  allObservables,
  networkTrackingOptions,
  amplitude,
}: {
  allObservables: AllWindowObservables;
  networkTrackingOptions: NetworkTrackingOptions;
  amplitude: BrowserClient;
}) {
  const { networkObservable } = allObservables;

  const filteredNetworkObservable = networkObservable.pipe(
    filter((event: TimestampedEvent<NetworkRequestEvent>) => {
      // Only track network events that should be tracked,
      return shouldTrackNetworkEvent(event.event as NetworkRequestEvent, networkTrackingOptions);
    }),
  );

  return filteredNetworkObservable.subscribe((networkEvent) => {
    const request = networkEvent.event;

    // convert to NetworkAnalyticsEvent
    const urlObj = parseUrl(request.url);
    /* istanbul ignore if */
    if (!urlObj) {
      // if the URL failed to parse, do not track the event
      // this is a very unlikely case, because URL() shouldn't throw an exception
      // when the URL is a valid URL
      /* istanbul ignore next */
      return;
    }

    const responseBodySize = request.responseHeaders ? calculateResponseBodySize(request.responseHeaders) : undefined;
    const requestBodySize = getRequestBodyLength(request.requestBody as FetchRequestBody);

    const networkAnalyticsEvent: NetworkAnalyticsEvent = {
      ['[Amplitude] URL']: urlObj.hrefWithoutQueryOrHash,
      ['[Amplitude] URL Query']: urlObj.query,
      ['[Amplitude] URL Fragment']: urlObj.fragment,
      ['[Amplitude] Request Method']: request.method,
      ['[Amplitude] Status Code']: request.status,
      ['[Amplitude] Start Time']: request.startTime,
      ['[Amplitude] Completion Time']: request.endTime,
      ['[Amplitude] Duration']: request.duration,
      ['[Amplitude] Request Body Size']: requestBodySize,
      ['[Amplitude] Response Body Size']: responseBodySize,
    };

    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_NETWORK_REQUEST_EVENT, networkAnalyticsEvent);
  });
}
