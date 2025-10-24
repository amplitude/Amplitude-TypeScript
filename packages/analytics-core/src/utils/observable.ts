export { Observable } from 'zen-observable-ts';

import { Observable as ZenObservable, Observer, Subscription } from 'zen-observable-ts';

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

function multicast<T>(source: ZenObservable<T>): ZenObservable<T> {
  let observers: Set<Observer<T>> = new Set();
  let subscription: Subscription | null = null;

  return new ZenObservable<T>((observer) => {
    observers.add(observer);

    if (subscription === null) {
      subscription = source.subscribe({
        next(value) {
          for (const obs of observers) {
            /* istanbul ignore next*/
            obs.next?.(value);
          }
        },
        error(err) {
          for (const obs of observers) {
            /* istanbul ignore next */
            obs.error?.(err);
          }
          cleanup();
        },
        complete() {
          for (const obs of observers) {
            /* istanbul ignore next */
            obs.complete?.();
          }
          cleanup();
        },
      });
    }

    // Return unsubscribe function for this observer
    return () => {
      observers.delete(observer);

      // If no observers left, unsubscribe from the source
      if (observers.size === 0 && subscription) {
        subscription.unsubscribe();
        subscription = null;
      }
    };
  });

  function cleanup() {
    /* istanbul ignore next */
    subscription?.unsubscribe();
    subscription = null;
    observers.clear();
  }
}


export { asyncMap, multicast };
