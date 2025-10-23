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

function merge<A, B>(sourceA: ZenObservable<A>, sourceB: ZenObservable<B>): ZenObservable<A | B> {
  return new ZenObservable<A | B>((observer) => {
    let completedCount = 0;
    let closed = false;

    const subscriptions: { unsubscribe: () => void }[] = [];

    const cleanup = (): void => {
      closed = true;
      for (const sub of subscriptions) {
        try {
          sub.unsubscribe();
        } catch {
          /* do nothing */
        }
      }
      subscriptions.length = 0;
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
          if (closed) return;
          completedCount++;
          if (completedCount === 2) {
            observer.complete();
            cleanup();
          }
        },
      });

      subscriptions.push(sub);
    };

    subscribeTo(sourceA);
    subscribeTo(sourceB);

    return cleanup;
  });
}

// function share() {

// }

// function throttle () {

// }

export { asyncMap, merge };
