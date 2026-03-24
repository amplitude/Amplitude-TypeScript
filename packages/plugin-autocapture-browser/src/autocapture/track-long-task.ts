import { BrowserClient, ElementInteractionsOptions, PerformanceTrackingOptions } from '@amplitude/analytics-core';
import { AMPLITUDE_LONG_TASK_EVENT } from '../constants';
import { isUrlAllowed } from '../helpers';

const DEFAULT_LONG_TASK_DURATION_THRESHOLD = 50; // ms, browser minimum

// PerformanceLongTaskTiming is not yet in TypeScript's built-in DOM types
interface TaskAttributionTiming extends PerformanceEntry {
  name: string;
}
interface PerformanceLongTaskTiming extends PerformanceEntry {
  attribution: TaskAttributionTiming[];
}
// How long to keep measures in the buffer before pruning
const MEASURE_BUFFER_WINDOW_MS = 10_000;

function getOverlappingMeasures(entry: PerformanceEntry, measures: PerformanceEntry[]): string[] {
  const taskStart = entry.startTime;
  const taskEnd = entry.startTime + entry.duration;
  return measures
    .filter((measure) => {
      const measureEnd = measure.startTime + measure.duration;
      return measure.startTime < taskEnd && measureEnd > taskStart;
    })
    .map((measure) => measure.name);
}

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

  // Rolling buffer of recent performance.measure() entries
  const measures: PerformanceEntry[] = [];

  const measureObserver = new PerformanceObserver((list) => {
    const now = performance.now();
    for (const entry of list.getEntries()) {
      measures.push(entry);
    }
    // Prune measures outside the buffer window to avoid unbounded memory growth
    const cutoff = now - MEASURE_BUFFER_WINDOW_MS;
    while (measures.length > 0 && measures[0].startTime < cutoff) {
      measures.shift();
    }
  });

  try {
    measureObserver.observe({ entryTypes: ['measure'] });
  } catch {
    // measure may not be supported — continue without it
  }

  const longTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!isUrlAllowed(options as ElementInteractionsOptions)) {
        return;
      }
      if (entry.duration >= durationThreshold) {
        const attribution = (entry as PerformanceLongTaskTiming).attribution;
        const overlappingMeasures = getOverlappingMeasures(entry, measures);
        amplitude.track(AMPLITUDE_LONG_TASK_EVENT, {
          '[Amplitude] Long Task Duration': entry.duration,
          '[Amplitude] Long Task Start Time': entry.startTime,
          ...(attribution && {
            '[Amplitude] Long Task Attribution': attribution.map((a: TaskAttributionTiming) => a.name),
          }),
          ...(overlappingMeasures.length > 0 && { '[Amplitude] Long Task Measures': overlappingMeasures }),
        });
      }
    }
  });

  try {
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    // longtask may not be supported in all browsers
    measureObserver.disconnect();
    return { unsubscribe: () => void 0 };
  }

  return {
    unsubscribe: () => {
      longTaskObserver.disconnect();
      measureObserver.disconnect();
    },
  };
}
