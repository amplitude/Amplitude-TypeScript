import { Observable, fromEvent } from 'rxjs';
import { Observable as ZenObservable, getGlobalScope } from '@amplitude/analytics-core';

/**
 * Creates an observable that tracks DOM mutations on the document body.
 */
export const createMutationObservable = (): Observable<MutationRecord[]> => {
  return new Observable<MutationRecord[]>((observer) => {
    const mutationObserver = new MutationObserver((mutations) => {
      observer.next(mutations);
    });
    mutationObserver.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
    });
    return () => mutationObserver.disconnect();
  });
};

// TODO: once we're ready for ZenObservable, remove this ignore and add tests
/* istanbul ignore next */
export const createMutationObservableZen = (): ZenObservable<MutationRecord[]> => {
  return new ZenObservable<MutationRecord[]>((observer) => {
    const mutationObserver = new MutationObserver((mutations) => {
      observer.next(mutations);
    });
    mutationObserver.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
    });
    return () => mutationObserver.disconnect();
  });
};

/**
 * Creates an observable that tracks click events on the document.
 * @param clickType - The type of click event to track (click or pointerdown)
 */
export const createClickObservable = (
  clickType: 'click' | 'pointerdown' = 'click',
): Observable<MouseEvent | PointerEvent> => {
  return fromEvent<MouseEvent>(document, clickType, { capture: true });
};

/**
 * Creates an observable that tracks click events on the document.
 * TODO: This should eventually be renamed to just "createClickObservable" and replace RxJS version
 * @param clickType - The type of click event to track (click or pointerdown)
 */
// TODO: once we're ready for ZenObservable, remove this ignore and add tests
/* istanbul ignore next */
export const createClickObservableZen = (
  clickType: 'click' | 'pointerdown' = 'click',
): ZenObservable<MouseEvent | PointerEvent> => {
  return new ZenObservable<MouseEvent | PointerEvent>((observer) => {
    const handler = (event: MouseEvent | PointerEvent) => {
      observer.next(event);
    };
    getGlobalScope()?.document.addEventListener(clickType, handler);
    return () => {
      getGlobalScope()?.document.removeEventListener(clickType, handler);
    };
  });
};
