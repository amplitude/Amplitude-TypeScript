import { TimestampedEvent } from './helpers';
import { Observable, consoleObserver, getGlobalScope, merge } from '@amplitude/analytics-core';

/* eslint-disable-next-line no-restricted-globals */
const globalScope = getGlobalScope() as typeof window;

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

const createConsoleErrorObservable = (): Observable<BrowserErrorEvent> => {
  return new Observable<BrowserErrorEvent>((observer) => {
    const handler = (_: string, ...args: any[]) => {
      /* istanbul ignore next */
      let message: string | undefined = undefined;
      if (Array.isArray(args[0]) && typeof args[0][0] === 'string') {
        message = args[0][0];
      }
      observer.next({ kind: 'console', message });
    };
    consoleObserver.addListener('error', handler);
    return () => {
      consoleObserver.removeListener(handler);
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
const createUnhandledErrorObservable = (): Observable<BrowserErrorEvent> => {
  return new Observable<BrowserErrorEvent>((observer) => {
    const handler = (event: Event) => {
      if (!(event instanceof ErrorEvent)) {
        return;
      }
      let output: BrowserErrorEvent = {
        kind: 'error',
      };

      if (event.error instanceof Error || event.error instanceof DOMException) {
        output = {
          ...output,
          message: event.error.message,
          stack: event.error.stack,
          filename: event.filename,
          lineNumber: event.lineno,
          columnNumber: event.colno,
        };
      } else if (typeof event.error === 'string') {
        output.message = event.error;
      }
      observer.next(output);
    };

    globalScope.addEventListener('error', handler);
    return () => {
      globalScope.removeEventListener('error', handler);
    };
  });
};

const createUnhandledRejectionObservable = (): Observable<BrowserErrorEvent> => {
  return new Observable<BrowserErrorEvent>((observer) => {
    const handler = (event: PromiseRejectionEvent) => {
      const output: BrowserErrorEvent = {
        kind: 'unhandledrejection',
      };
      if (event.reason instanceof Error || event.reason instanceof DOMException) {
        output.message = event.reason.message;
        output.stack = event.reason.stack;
      } else if (typeof event.reason === 'string') {
        output.message = event.reason;
      }
      observer.next(output);
    };
    globalScope.addEventListener('unhandledrejection', handler);
    return () => {
      globalScope.removeEventListener('unhandledrejection', handler);
    };
  });
};

export type BrowserErrorEvent = {
  kind: 'error' | 'unhandledrejection' | 'console';
  message?: string;
  filename?: string;
  lineNumber?: number;
  columnNumber?: number;
  stack?: string;
};

export const createErrorObservable = (): Observable<BrowserErrorEvent> => {
  const unhandledErrorObservable = merge(createUnhandledErrorObservable(), createUnhandledRejectionObservable());
  return merge(unhandledErrorObservable, createConsoleErrorObservable());
};

export const createMouseMoveObservable = (): Observable<MouseEvent> => {
  return new Observable<MouseEvent>((observer) => {
    const handler = (event: MouseEvent) => {
      observer.next(event);
    };
    const args: AddEventListenerOptions = { capture: true };
    globalScope.document.addEventListener('mousemove', handler, args);
    return () => {
      globalScope.document.removeEventListener('mousemove', handler, args);
    };
  });
};
