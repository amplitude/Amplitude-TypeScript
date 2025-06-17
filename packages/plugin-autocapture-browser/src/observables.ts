import { Observable, fromEvent } from 'rxjs';

/**
 * Shared observable that tracks DOM mutations.
 */
export const mutationObservable = new Observable<MutationRecord[]>((observer) => {
  const mutationObserver = new MutationObserver((mutations) => {
    observer.next(mutations);
  });
  mutationObserver.observe(document.body, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });
  return () => {
    mutationObserver.disconnect();
  };
});

/**
 * Shared observable that tracks click events.
 */
export const clickDelegateObservable = fromEvent<MouseEvent>(document, 'click', { capture: true });
