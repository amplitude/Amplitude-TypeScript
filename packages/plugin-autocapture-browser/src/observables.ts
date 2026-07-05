import { collectOpenShadowRoots, querySelectorAllDeep, TimestampedEvent } from './helpers';
import { Observable, consoleObserver, getGlobalScope, merge } from '@amplitude/analytics-core';

/* eslint-disable-next-line no-restricted-globals */
const globalScope = getGlobalScope() as typeof window;

/**
 * Lazily-read shadow-DOM gate. The plugin builds observables at setup time, but
 * remote config arrives afterward — so the gate must be read on each callback,
 * never captured once. Defaults (disabled) keep the off path byte-identical.
 */
export type ShadowConfigGetter = () => { enabled: boolean; maxDepth: number };

const MUTATION_OBSERVER_INIT: MutationObserverInit = {
  childList: true,
  attributes: true,
  characterData: true,
  subtree: true,
};

/**
 * Observe mutations across the main document AND any open shadow roots.
 *
 * A single `MutationObserver` cannot see into shadow trees — `subtree: true`
 * stops at each boundary. So we fan one observer out across every open shadow
 * root: an initial recursive scan attaches to existing roots (up to the
 * configured depth), and the observer's own callback scans each mutation's
 * `addedNodes` for shadow roots that mount after load and attaches to those too
 * (the depth cap bounds the work; there is no native `attachShadow` event to
 * hook). Closed roots are invisible and skipped. With shadow support off, this
 * observes only `document.body` — identical to the prior implementation.
 */
export const createMutationObservable = (getShadowConfig?: ShadowConfigGetter): Observable<MutationRecord[]> => {
  return new Observable<MutationRecord[]>((observer) => {
    // Track observed roots to avoid double-observing, plus the shadow-boundary
    // depth of each observed shadow root (the main document is depth 0).
    const observed = new WeakSet<Node>();
    const rootDepth = new Map<Node, number>();

    const observeRoot = (root: Node, depth: number): void => {
      if (observed.has(root)) {
        return;
      }
      observed.add(root);
      if (root instanceof ShadowRoot) {
        rootDepth.set(root, depth);
      }
      mutationObserver.observe(root, MUTATION_OBSERVER_INIT);
    };

    // Attach to every open shadow root within `host`'s subtree, offset by the
    // crossing depth of the tree `host` already lives in.
    const observeShadowRootsWithin = (host: Element, baseDepth: number, maxDepth: number): void => {
      const remaining = maxDepth - baseDepth;
      if (remaining <= 0) {
        return;
      }
      collectOpenShadowRoots(host, remaining).forEach(({ root, depth }) => observeRoot(root, baseDepth + depth));
    };

    // Crossing depth of the tree a mutation occurred in: 0 for the main
    // document, or the recorded depth of the enclosing shadow root.
    const depthOfTree = (node: Node): number => {
      const treeRoot = node.getRootNode();
      return treeRoot instanceof ShadowRoot ? rootDepth.get(treeRoot) ?? 0 : 0;
    };

    const mutationObserver = new MutationObserver((mutations) => {
      observer.next(mutations);

      // The entire shadow branch — including reading the gate getter — is
      // wrapped so a throw here can never escape to the host page's onerror.
      try {
        const cfg = getShadowConfig?.();
        if (!cfg?.enabled) {
          return;
        }
        // Late-loading components: attach observers to shadow roots that
        // appeared since the last batch, recursively, within the depth budget.
        for (const mutation of mutations) {
          const baseDepth = depthOfTree(mutation.target);
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              observeShadowRootsWithin(node, baseDepth, cfg.maxDepth);
            }
          });
        }
      } catch {
        // Shadow fan-out failed for this batch; events already emitted above.
      }
    });

    if (document.body) {
      observeRoot(document.body, 0);
      // Initial shadow attach, fully guarded — the main-document observer is
      // already live regardless of whether this succeeds.
      try {
        const cfg = getShadowConfig?.();
        if (cfg?.enabled) {
          observeShadowRootsWithin(document.body, 0, cfg.maxDepth);
        }
      } catch {
        // Initial shadow attach failed; the main-document observer is live.
      }
    }

    // A single disconnect detaches the observer from every root at once.
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

    getGlobalScope()?.addEventListener('scroll', handler);
    return () => {
      getGlobalScope()?.removeEventListener('scroll', handler);
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
  getShadowConfig?: ShadowConfigGetter,
): Observable<Event> => {
  return new Observable<Event>((observer) => {
    const globalScope = getGlobalScope();

    if (!globalScope?.IntersectionObserver) {
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

    // Depth budget for piercing discovery into shadow roots. 0 (off) makes the
    // deep query a plain light-DOM querySelectorAll — unchanged behavior.
    const shadowDepth = () => {
      const cfg = getShadowConfig?.();
      return cfg?.enabled ? cfg.maxDepth : 0;
    };

    const selectorString = selectorAllowlist.join(',');

    // Element discovery runs `querySelectorAll` against arbitrary customer DOM
    // (a malformed `cssSelectorAllowlist` entry throws `SyntaxError`) and, when
    // shadow is on, walks open shadow roots. This is a native-callback / setup
    // entry point with no SDK boundary above it, so a throw would reach
    // `window.onerror`. Contain it here: discovery is best-effort and a failure
    // just means some elements aren't tracked — never a host-page crash.
    const observeMatches = (root: Element | Document) => {
      try {
        querySelectorAllDeep(root, selectorString, shadowDepth()).forEach((element) => {
          intersectionObserver.observe(element);
        });
      } catch {
        // Best-effort discovery; skip this root.
      }
    };

    // Observe initial elements (piercing open shadow roots when enabled).
    /* istanbul ignore next */
    if (globalScope?.document) {
      observeMatches(globalScope.document);
    }

    // Use mutation observable to observe new elements that match the allowlist.
    const mutationSubscription = mutationObservable.subscribe(({ event }) =>
      event.forEach(({ addedNodes }) =>
        addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }
          try {
            if (node.matches(selectorString)) {
              intersectionObserver.observe(node);
            }
          } catch {
            // Malformed selector — skip the self-match, still try descendants.
          }
          observeMatches(node);
        }),
      ),
    );

    return () => {
      mutationSubscription.unsubscribe();
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
