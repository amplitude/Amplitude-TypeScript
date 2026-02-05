import { Observable } from '@amplitude/analytics-core';
import { AllWindowObservables } from '../frustration-plugin';

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

const DEFAULT_THRESHOLD = 10;
const DEFAULT_WINDOW_MS = 2000;

export const createThrashedCursorObservable = ({
  mouseDirectionChangeObservable,
  threshold = DEFAULT_THRESHOLD,
  windowMs = DEFAULT_WINDOW_MS,
}: {
  mouseDirectionChangeObservable: Observable<Axis>;
  threshold?: number;
  windowMs?: number;
}): Observable<number> => {
  return new Observable<number>((observer) => {
    let xDirectionChanges: number[] = [];
    let yDirectionChanges: number[] = [];
    let pendingThrashedCursorTimeX: number | null = null;
    let pendingThrashedCursorTimeY: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // checks if there are enough direction changes within window + threshold
    // for it to be considered a thrashed cursor
    function isThrashedCursor(directionChanges: number[]): boolean {
      const nthLastIndex = directionChanges.length - threshold;
      if (nthLastIndex < 0) return false;
      const delta = directionChanges[directionChanges.length - 1] - directionChanges[nthLastIndex];
      return delta < windowMs;
    }

    // if a thrashed cursor is pending, return the earliest time
    function getPendingThrashedCursor() {
      if (pendingThrashedCursorTimeX && pendingThrashedCursorTimeY) {
        return Math.min(pendingThrashedCursorTimeX, pendingThrashedCursorTimeY);
      } else if (pendingThrashedCursorTimeX) {
        return pendingThrashedCursorTimeX;
      } else if (pendingThrashedCursorTimeY) {
        return pendingThrashedCursorTimeY;
      }
      return null;
    }

    function emitPendingThrashedCursor() {
      const pendingThrashedCursor = getPendingThrashedCursor();
      if (pendingThrashedCursor !== null) {
        observer.next(pendingThrashedCursor);

        // reset window
        if (timer !== null) clearTimeout(timer);
        pendingThrashedCursorTimeX = null;
        pendingThrashedCursorTimeY = null;
        xDirectionChanges = [];
        yDirectionChanges = [];
      }
    }

    return mouseDirectionChangeObservable.subscribe((axis) => {
      const now = +Date.now();

      if (timer !== null) clearTimeout(timer);

      if (axis === Axis.X) {
        xDirectionChanges.push(now);
      } else if (axis === Axis.Y) {
        yDirectionChanges.push(now);
      }

      let isInThrashedCursorWindow = false;
      if (isThrashedCursor(xDirectionChanges)) {
        pendingThrashedCursorTimeX = pendingThrashedCursorTimeX || xDirectionChanges[0];
        isInThrashedCursorWindow = true;
      }
      if (isThrashedCursor(yDirectionChanges)) {
        pendingThrashedCursorTimeY = pendingThrashedCursorTimeY || yDirectionChanges[0];
        isInThrashedCursorWindow = true;
      }

      if (isInThrashedCursorWindow) {
        // if we're in a thrashed cursor window, debounce it for "windowMs" duration
        // this is so that any future mouse moves do not get counted as new thrashed
        // cursor events
        timer = setTimeout(() => {
          emitPendingThrashedCursor();
          timer = null;
        }, windowMs);
      } else {
        // if the thrashed cursor window has closed, see if there's any pending
        emitPendingThrashedCursor();
      }
    });
  });
};
