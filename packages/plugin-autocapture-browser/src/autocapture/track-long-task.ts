import { BrowserClient, ElementInteractionsOptions, PerformanceTrackingOptions } from '@amplitude/analytics-core';
import { AMPLITUDE_MAIN_THREAD_BLOCK_EVENT } from '../constants';
import { isUrlAllowed } from '../helpers';

const DEFAULT_DURATION_THRESHOLD = 100; // ms
const MEASURE_BUFFER_WINDOW_MS = 10_000;

// LoAF and Long Task types are not yet in TypeScript's built-in DOM types
interface PerformanceScriptTiming extends PerformanceEntry {
  sourceURL: string;
  sourceFunctionName: string;
  invokerType: string;
  invoker: string;
}

interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  renderStart: number;
  styleAndLayoutStart: number;
  blockingDuration: number;
  scripts: PerformanceScriptTiming[];
}

interface TaskAttributionTiming extends PerformanceEntry {
  name: string;
}

interface PerformanceLongTaskTiming extends PerformanceEntry {
  attribution: TaskAttributionTiming[];
}

function getOverlappingMeasures(entry: PerformanceEntry, measures: PerformanceEntry[]): string[] {
  const taskEnd = entry.startTime + entry.duration;
  return measures
    .filter((measure) => measure.startTime < taskEnd && measure.startTime + measure.duration > entry.startTime)
    .map((measure) => measure.name);
}

function buildLoAFProperties(entry: PerformanceLongAnimationFrameTiming, measures: PerformanceEntry[]) {
  const overlappingMeasures = getOverlappingMeasures(entry, measures);
  const scripts = entry.scripts ?? [];

  const scriptURLs = scripts.map((s) => s.sourceURL).filter(Boolean);
  const scriptFunctions = scripts.map((s) => s.sourceFunctionName).filter(Boolean);
  const invokerTypes = scripts.map((s) => s.invokerType).filter(Boolean);
  const invokers = scripts.map((s) => s.invoker).filter(Boolean);

  return {
    '[Amplitude] Main Thread Block Source': 'long-animation-frame',
    '[Amplitude] Main Thread Block Duration': entry.duration,
    '[Amplitude] Main Thread Block Blocking Duration': entry.blockingDuration,
    '[Amplitude] Main Thread Block Start Time': entry.startTime,
    ...(overlappingMeasures.length > 0 && { '[Amplitude] Main Thread Block Measures': overlappingMeasures }),
    '[Amplitude] Main Thread Block Render Start': entry.renderStart,
    '[Amplitude] Main Thread Block Style And Layout Start': entry.styleAndLayoutStart,
    '[Amplitude] Main Thread Block Script Count': scripts.length,
    ...(scriptURLs.length > 0 && { '[Amplitude] Main Thread Block Script URLs': scriptURLs }),
    ...(scriptFunctions.length > 0 && { '[Amplitude] Main Thread Block Script Functions': scriptFunctions }),
    ...(invokerTypes.length > 0 && { '[Amplitude] Main Thread Block Invoker Types': invokerTypes }),
    ...(invokers.length > 0 && { '[Amplitude] Main Thread Block Invokers': invokers }),
  };
}

function buildLongTaskProperties(entry: PerformanceLongTaskTiming, measures: PerformanceEntry[]) {
  const overlappingMeasures = getOverlappingMeasures(entry, measures);
  const attribution = entry.attribution ?? [];

  return {
    '[Amplitude] Main Thread Block Source': 'long-task',
    '[Amplitude] Main Thread Block Duration': entry.duration,
    '[Amplitude] Main Thread Block Blocking Duration': entry.duration,
    '[Amplitude] Main Thread Block Start Time': entry.startTime,
    ...(overlappingMeasures.length > 0 && { '[Amplitude] Main Thread Block Measures': overlappingMeasures }),
    ...(attribution.length > 0 && {
      '[Amplitude] Main Thread Block Attribution': attribution.map((a: TaskAttributionTiming) => a.name),
    }),
  };
}

function getSupportedEntryType(): 'long-animation-frame' | 'longtask' | null {
  /* istanbul ignore next */
  if (typeof PerformanceObserver === 'undefined') return null;
  try {
    const supported = PerformanceObserver.supportedEntryTypes;
    if (supported.includes('long-animation-frame')) return 'long-animation-frame';
    if (supported.includes('longtask')) return 'longtask';
  } catch {
    // ignore
  }
  return null;
}

export function trackMainThreadBlock({
  amplitude,
  options,
  durationThreshold = DEFAULT_DURATION_THRESHOLD,
}: {
  amplitude: BrowserClient;
  options: PerformanceTrackingOptions;
  durationThreshold?: number;
}) {
  const entryType = getSupportedEntryType();

  /* istanbul ignore next */
  if (!entryType) {
    return { unsubscribe: () => void 0 };
  }

  const measures: PerformanceEntry[] = [];

  const measureObserver = new PerformanceObserver((list) => {
    const now = performance.now();
    for (const entry of list.getEntries()) {
      measures.push(entry);
    }
    const cutoff = now - MEASURE_BUFFER_WINDOW_MS;
    while (measures.length > 0 && measures[0].startTime < cutoff) {
      measures.shift();
    }
  });

  try {
    measureObserver.observe({ entryTypes: ['measure'] });
  } catch {
    // measure not supported — continue without it
  }

  const blockObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!isUrlAllowed(options as ElementInteractionsOptions)) {
        return;
      }
      if (entry.duration < durationThreshold) {
        continue;
      }
      const properties =
        entryType === 'long-animation-frame'
          ? buildLoAFProperties(entry as PerformanceLongAnimationFrameTiming, measures)
          : buildLongTaskProperties(entry as PerformanceLongTaskTiming, measures);

      amplitude.track(AMPLITUDE_MAIN_THREAD_BLOCK_EVENT, properties);
    }
  });

  try {
    blockObserver.observe({ entryTypes: [entryType] });
  } catch {
    measureObserver.disconnect();
    return { unsubscribe: () => void 0 };
  }

  return {
    unsubscribe: () => {
      blockObserver.disconnect();
      measureObserver.disconnect();
    },
  };
}
