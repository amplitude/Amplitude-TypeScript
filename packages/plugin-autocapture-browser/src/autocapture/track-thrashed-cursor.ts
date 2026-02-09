import { BrowserClient, ElementInteractionsOptions, Observable } from '@amplitude/analytics-core';
import { AllWindowObservables } from '../frustration-plugin';
import { AMPLITUDE_THRASHED_CURSOR_EVENT } from '../constants';
import { isUrlAllowed } from '../helpers';

type Position = {
  x: number;
  y: number;
};

enum Direction {
  INCREASING = 'increasing',
  DECREASING = 'decreasing',
}

enum Axis {
  X = 'x',
  Y = 'y',
}

export const createMouseDirectionChangeObservable = ({
  allWindowObservables,
}: {
  allWindowObservables: AllWindowObservables;
}): Observable<Axis> => {
  const { mouseMoveObservable } = allWindowObservables;
  return new Observable<Axis>((observer) => {
    let lastPosition: Position | null = null;
    let xDirection: Direction | null = null;
    let yDirection: Direction | null = null;
    return mouseMoveObservable.subscribe((event) => {
      const currentPosition = { x: event.clientX, y: event.clientY };
      if (lastPosition === null) {
        lastPosition = currentPosition;
        return;
      }
      if (currentPosition.x > lastPosition.x) {
        if (xDirection === Direction.DECREASING) {
          observer.next(Axis.X);
        }
        xDirection = Direction.INCREASING;
      } else if (currentPosition.x < lastPosition.x) {
        if (xDirection === Direction.INCREASING) {
          observer.next(Axis.X);
        }
        xDirection = Direction.DECREASING;
      }

      if (currentPosition.y > lastPosition.y) {
        if (yDirection === Direction.DECREASING) {
          observer.next(Axis.Y);
        }
        yDirection = Direction.INCREASING;
      } else if (currentPosition.y < lastPosition.y) {
        if (yDirection === Direction.INCREASING) {
          observer.next(Axis.Y);
        }
        yDirection = Direction.DECREASING;
      }
      lastPosition = currentPosition;
    });
  });
};

type DirectionChangeSeries = {
  // number of direction changes to be considered a thrashed cursor
  changesThreshold: number;
  // timestamps of direction changes (limited to "changesThreshold" to avoid memory leaks)
  changes: number[];
  // window duration in milliseconds
  thresholdMs: number;
  // when the series of direction   changes started
  startTime?: number;
};

function addDirectionChange(directionChangeSeries: DirectionChangeSeries) {
  const now = +Date.now();

  directionChangeSeries.startTime = directionChangeSeries.startTime || now;

  // add this direction change to the series (fixed length array to avoid memory leaks)
  const { changes, changesThreshold } = directionChangeSeries;
  changes.push(now);
  if (changes.length > changesThreshold) changes.shift();
}

function isAboveTimeThreshold(directionChanges: DirectionChangeSeries): boolean {
  const { changes, thresholdMs } = directionChanges;
  const delta = changes[changes.length - 1] - changes[0];
  return delta >= thresholdMs;
}

// checks if there are enough direction changes within window + threshold
// for it to be considered a thrashed cursor
function isThrashedCursor(directionChanges: DirectionChangeSeries): boolean {
  const { changes, changesThreshold } = directionChanges;
  if (changes.length < changesThreshold) return false;
  return !isAboveTimeThreshold(directionChanges);
}

// if the time between first and last change is greater than the threshold,
// shift the window to the right until it is below the threshold
function adjustWindow(directionChanges: DirectionChangeSeries) {
  const { changes } = directionChanges;
  let i = 0;
  while (i < changes.length) {
    if (isAboveTimeThreshold(directionChanges)) {
      changes.shift();
      directionChanges.startTime = changes[0];
    } else {
      break;
    }
  }
}

function getPendingThrashedCursor(
  directionChangesX: DirectionChangeSeries,
  directionChangesY: DirectionChangeSeries,
): number | undefined {
  let startTime = undefined;
  if (isThrashedCursor(directionChangesX)) {
    startTime = directionChangesX.startTime;
  }
  if (isThrashedCursor(directionChangesY)) {
    const startTimeY = directionChangesY.startTime;
    if (startTimeY && (!startTime || startTimeY < startTime)) {
      startTime = startTimeY;
    }
  }
  return startTime;
}

const DEFAULT_THRESHOLD = 10;
const DEFAULT_WINDOW_MS = 2_000;

export const createThrashedCursorObservable = ({
  mouseDirectionChangeObservable,
  directionChanges = DEFAULT_THRESHOLD,
  thresholdMs = DEFAULT_WINDOW_MS,
}: {
  mouseDirectionChangeObservable: Observable<Axis>;
  directionChanges?: number;
  thresholdMs?: number;
}): Observable<number> => {
  return new Observable<number>((observer) => {
    const xDirectionChanges: DirectionChangeSeries = { changes: [], changesThreshold: directionChanges, thresholdMs };
    const yDirectionChanges: DirectionChangeSeries = { changes: [], changesThreshold: directionChanges, thresholdMs };
    let pendingThrashedCursor: number | undefined = undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function emitPendingThrashedCursor() {
      if (pendingThrashedCursor !== undefined) {
        observer.next(pendingThrashedCursor);
        pendingThrashedCursor = undefined;

        // reset window
        if (timer !== null) clearTimeout(timer);
      }
    }

    function resetDirectionChangeSeries() {
      xDirectionChanges.startTime = undefined;
      xDirectionChanges.changes = [];
      yDirectionChanges.startTime = undefined;
      yDirectionChanges.changes = [];
    }

    return mouseDirectionChangeObservable.subscribe((axis) => {
      if (timer !== null) clearTimeout(timer);
      addDirectionChange(axis === Axis.X ? xDirectionChanges : yDirectionChanges);

      const nextPendingThrashedCursor = getPendingThrashedCursor(xDirectionChanges, yDirectionChanges);
      if (nextPendingThrashedCursor) {
        // if we're in a thrashed cursor window, debounce it for "thresholdMs" duration
        // this is so that we do not restart the window if more direction changes are
        // detected in this series
        pendingThrashedCursor = pendingThrashedCursor || nextPendingThrashedCursor;
        timer = setTimeout(() => {
          emitPendingThrashedCursor();
          resetDirectionChangeSeries();
          timer = null;
        }, thresholdMs);
      } else {
        emitPendingThrashedCursor();
      }

      adjustWindow(xDirectionChanges);
      adjustWindow(yDirectionChanges);

      /* istanbul ignore next */
      return () => {
        /* istanbul ignore if */
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      };
    });
  });
};

export const trackThrashedCursor = ({
  amplitude,
  options,
  allObservables,
  directionChanges = DEFAULT_THRESHOLD,
  thresholdMs = DEFAULT_WINDOW_MS,
}: {
  amplitude: BrowserClient;
  options: ElementInteractionsOptions;
  allObservables: AllWindowObservables;
  directionChanges?: number;
  thresholdMs?: number;
}) => {
  const mouseDirectionChangeObservable = createMouseDirectionChangeObservable({ allWindowObservables: allObservables });
  const thrashedCursorObservable = createThrashedCursorObservable({
    mouseDirectionChangeObservable,
    directionChanges,
    thresholdMs,
  });
  return thrashedCursorObservable.subscribe((time) => {
    if (!isUrlAllowed(options)) {
      return;
    }
    amplitude.track(AMPLITUDE_THRASHED_CURSOR_EVENT, undefined, { time });
  });
};
