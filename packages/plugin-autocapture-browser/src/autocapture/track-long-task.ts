import { BrowserClient, ElementInteractionsOptions, PerformanceTrackingOptions } from '@amplitude/analytics-core';
import { AMPLITUDE_LONG_TASK_EVENT } from '../constants';
import { isUrlAllowed } from '../helpers';

const DEFAULT_LONG_TASK_DURATION_THRESHOLD = 50; // ms, browser minimum

export function trackLongTask({
  amplitude,
  options,
  durationThreshold = DEFAULT_LONG_TASK_DURATION_THRESHOLD,
}: {
  amplitude: BrowserClient;
  options: PerformanceTrackingOptions;
  durationThreshold?: number;
}) {
  /* istanbul ignore next */
  if (typeof PerformanceObserver === 'undefined') {
    return { unsubscribe: () => void 0 };
  }

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!isUrlAllowed(options as ElementInteractionsOptions)) {
        return;
      }
      if (entry.duration >= durationThreshold) {
        amplitude.track(AMPLITUDE_LONG_TASK_EVENT, {
          '[Amplitude] Long Task Duration': entry.duration,
          '[Amplitude] Long Task Start Time': entry.startTime,
        });
      }
    }
  });

  try {
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask may not be supported in all browsers
    return { unsubscribe: () => void 0 };
  }

  return {
    unsubscribe: () => {
      observer.disconnect();
    },
  };
}
