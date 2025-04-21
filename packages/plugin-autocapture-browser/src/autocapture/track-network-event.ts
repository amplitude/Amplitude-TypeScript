import { NetworkRequestEvent } from '@amplitude/analytics-core';
import { NetworkCaptureRule, NetworkTrackingOptions } from '@amplitude/analytics-core/lib/esm/types/network-tracking';

const DEFAULT_STATUS_CODE_RANGE = '0,500-599';

// TODO: consider moving this to a shared util
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
    if (statusCode >= start && (end === undefined || statusCode <= end)) {
      return true;
    }
  }
  return false;
}

function isCaptureRuleMatch(rule: NetworkCaptureRule, hostname: string, status?: number) {
  // check if the host is in the allowed hosts
  if (rule.hosts && !rule.hosts.find((host) => wildcardMatch(hostname, host))) {
    return false;
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
  if (options.ignoreAmplitudeRequests !== false && wildcardMatch(host, '*.amplitude.com')) {
    return false;
  }

  // false if the host is in the ignore list
  if (options.ignoreHosts?.find((ignoreHost) => wildcardMatch(host, ignoreHost))) {
    return false;
  }

  // false if the status code is not 0 or 500-599 and there are no captureRules
  if (
    !options.captureRules &&
    networkEvent.status &&
    !isStatusCodeInRange(networkEvent.status, DEFAULT_STATUS_CODE_RANGE)
  ) {
    return false;
  }

  // false if it fails all of the captureRules
  if (
    options.captureRules &&
    !options.captureRules.find((rule) => isCaptureRuleMatch(rule, host, networkEvent.status))
  ) {
    return false;
  }

  return true;
}

export function trackNetworkEvent() {
  throw new Error('Not implemented');
}
