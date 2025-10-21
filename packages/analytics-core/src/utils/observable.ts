export { Observable } from 'zen-observable-ts';

import { Observable as ZenObservable } from 'zen-observable-ts';

/**
 * asyncMap operator for Zen Observable
 *
 * Maps each value emitted by the source Observable using an async function,
 * emitting the resolved values in the same order they arrive.
 */
function asyncMap<T, R>(observable: ZenObservable<T>, fn: (value: T) => Promise<R>): ZenObservable<R> {
  return new ZenObservable(
    (observer: { next: (value: R) => void; error: (error: any) => void; complete: () => void }) => {
      observable.subscribe({
        next: (value: T) => {
          fn(value)
            .then((result: R) => {
              return observer.next(result);
            })
            .catch((error: any) => observer.error(error));
        },
        error: (error: any) => {
          observer.error(error);
        },
        complete: () => {
          observer.complete();
        },
      });
    },
  );
}

// function share() {

// }

// function throttle () {

// }

export { asyncMap };
