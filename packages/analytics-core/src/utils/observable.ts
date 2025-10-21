import { Observable as ZenObservable } from 'zen-observable-ts';

export class Observable<T> extends ZenObservable<T> {
  constructor(
    subscriber: (observer: { next: (value: T) => void; error: (error: any) => void; complete: () => void }) => void,
  ) {
    super(subscriber);
  }
}

/**
 * asyncMap operator for Zen Observable
 *
 * Maps each value emitted by the source Observable using an async function,
 * emitting the resolved values in the same order they arrive.
 */
function asyncMap<T, R>(observable: Observable<T>, fn: (value: T) => Promise<R>): Observable<R> {
  return new Observable((observer: { next: (value: R) => void; error: (error: any) => void; complete: () => void }) => {
    observable.subscribe({
      next: (value: T) => {
        fn(value)
          .then((result: R) => observer.next(result))
          .catch((error: any) => observer.error(error));
      },
      error: (error: any) => {
        observer.error(error);
      },
      complete: () => {
        observer.complete();
      },
    });
  });
}

export { asyncMap };
