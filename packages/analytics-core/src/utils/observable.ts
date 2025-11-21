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

type Unsubscribable = {
  unsubscribe: () => void;
};

/**
 * merge operator for Zen Observable
 *
 * Merges two observables into a single observable, emitting values from both sources in the order they arrive.
 * @param sourceA Observable to merge
 * @param sourceB Observable to merge
 * @returns Unsubscribable cleanup function
 */
function merge<A, B>(sourceA: ZenObservable<A>, sourceB: ZenObservable<B>): ZenObservable<A | B> {
  return new ZenObservable<A | B>((observer) => {
    let closed = false;

    const subscriptions: Set<Unsubscribable> = new Set();

    const cleanup = (): void => {
      closed = true;
      for (const sub of subscriptions) {
        try {
          sub.unsubscribe();
        } catch {
          /* do nothing */
        }
      }
      subscriptions.clear();
    };

    const subscribeTo = <T>(source: ZenObservable<T>) => {
      const sub = source.subscribe({
        next(value: T) {
          if (!closed) observer.next(value as A | B);
        },
        error(err) {
          if (!closed) {
            closed = true;
            observer.error(err);
            cleanup();
          }
        },
        complete() {
          subscriptions.delete(sub);
          if (!closed && subscriptions.size === 0) {
            observer.complete();
            cleanup();
            closed = true;
          }
        },
      });

      subscriptions.add(sub);
    };

    subscribeTo(sourceA);
    subscribeTo(sourceB);

    return cleanup;
  });
}

// function share() {
function multicast<T>(source: ZenObservable<T>): ZenObservable<T> {
  const observers: Set<Observer<T>> = new Set();
  let subscription: Subscription | null = null;

  function cleanup() {
    /* istanbul ignore next */
    subscription?.unsubscribe();
    subscription = null;
    observers.clear();
  }

  return new ZenObservable<T>((observer) => {
    observers.add(observer);

    if (subscription === null) {
      subscription = source.subscribe({
        next(value) {
          for (const obs of observers) {
            /* istanbul ignore next */
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
}

export { asyncMap, multicast, merge, Unsubscribable };
