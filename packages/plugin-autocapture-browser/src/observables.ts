import { Observable, getGlobalScope } from '@amplitude/analytics-core';

export const createMutationObservable = (): Observable<MutationRecord[]> => {
  return new Observable<MutationRecord[]>((observer) => {
    const mutationObserver = new MutationObserver((mutations) => {
      observer.next(mutations);
    });
    if (document.body) {
      mutationObserver.observe(document.body, {
        childList: true,
        attributes: true,
        characterData: true,
        subtree: true,
      });
    }
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
  return new Observable<MouseEvent | PointerEvent>((observer) => {
    const handler = (event: MouseEvent | PointerEvent) => {
      observer.next(event);
    };
    /* istanbul ignore next */
    getGlobalScope()?.document.addEventListener(clickType, handler, { capture: true });
    return () => {
      /* istanbul ignore next */
      getGlobalScope()?.document.removeEventListener(clickType, handler, { capture: true });
    };
  });
};
