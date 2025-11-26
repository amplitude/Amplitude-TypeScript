import { Observable, getGlobalScope } from '@amplitude/analytics-core';
import { TimestampedEvent } from './helpers';

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

    getGlobalScope()?.document.addEventListener(clickType, handler, { capture: true });
    return () => {
      getGlobalScope()?.document.removeEventListener(clickType, handler, { capture: true });
    };
  });
};

export const createScrollObservable = (): Observable<Event> => {
  return new Observable<Event>((observer) => {
    const handler = (event: Event) => {
      observer.next(event);
    };

    getGlobalScope()?.window.addEventListener('scroll', handler);
    return () => {
      getGlobalScope()?.window.removeEventListener('scroll', handler);
    };
  });
};

// Tracks when a trackedelement is exposed to the viewport
export const createExposureObservable = (
  mutationObservable: Observable<TimestampedEvent<MutationRecord[]>>,
  selectorAllowlist: string[],
): Observable<Event> => {
  return new Observable<Event>((observer) => {
    const globalScope = getGlobalScope();

    if (!globalScope?.IntersectionObserver) {
      console.log('IntersectionObserver not supported');
      return () => {
        return;
      };
    }

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          observer.next(entry as unknown as Event);
        });
      },
      {
        root: null, // viewport
        rootMargin: '0px', // start exactly at the viewport edge
        threshold: 1.0, // trigger when 100% of the element is visible
      },
    );

    // Observe initial elements
    const selectorString = selectorAllowlist.join(',');
    /* istanbul ignore next */
    const initialElements = globalScope?.document.querySelectorAll(selectorString) ?? [];
    initialElements.forEach((element) => {
      intersectionObserver.observe(element);
    });

    // Use mutation observable to observe new elements
    mutationObservable.subscribe(({ event }) =>
      event.forEach(({ addedNodes }) =>
        addedNodes.forEach((node) => node instanceof Element && intersectionObserver.observe(node)),
      ),
    );

    return () => {
      intersectionObserver.disconnect();
    };
  });
};
