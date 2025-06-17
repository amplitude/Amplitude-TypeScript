import { Observable, fromEvent } from 'rxjs';

/**
 * Creates an observable that tracks DOM mutations on the document body.
 * This observable can be shared across different plugins to avoid creating multiple mutation observers.
 */
export const globalMutationObservable = new Observable<MutationRecord[]>((observer) => {
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

/**
 * Creates an observable that tracks click events on the document.
 * This observable can be shared across different plugins to avoid creating multiple event listeners.
 */
export const globalClickObservable = fromEvent<MouseEvent>(document, 'click', { capture: true });
