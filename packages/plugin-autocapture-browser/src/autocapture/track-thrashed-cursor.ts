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
