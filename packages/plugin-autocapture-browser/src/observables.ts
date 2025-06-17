import { Observable, fromEvent } from 'rxjs';
import { share } from 'rxjs/operators';

let mutationObservableInstance: Observable<MutationRecord[]> | null = null;
let clickObservableInstance: Observable<MouseEvent> | null = null;

/**
 * Creates an observable that tracks DOM mutations on the document body.
 * This observable is created lazily and shared across different plugins to avoid creating multiple mutation observers.
 */
export const getGlobalMutationObservable = (): Observable<MutationRecord[]> => {
  if (!mutationObservableInstance) {
    mutationObservableInstance = new Observable<MutationRecord[]>((observer) => {
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
    }).pipe(share());
  }
  return mutationObservableInstance;
};

/**
 * Creates an observable that tracks click events on the document.
 * This observable is created lazily and shared across different plugins to avoid creating multiple event listeners.
 */
export const getGlobalClickObservable = (): Observable<MouseEvent> => {
  if (!clickObservableInstance) {
    clickObservableInstance = fromEvent<MouseEvent>(document, 'click', { capture: true }).pipe(share());
  }
  return clickObservableInstance;
};
