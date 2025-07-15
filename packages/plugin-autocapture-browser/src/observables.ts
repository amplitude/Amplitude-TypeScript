import { Observable, fromEvent } from 'rxjs';

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

/**
 * Creates an observable that tracks click events on the document.
 * @param clickType - The type of click event to track (click or pointerdown)
 */
export const createClickObservable = (clickType: 'click' | 'pointerdown' = 'click'): Observable<MouseEvent> => {
  return fromEvent<MouseEvent>(document, clickType, { capture: true });
};
