import { collectOpenShadowRoots } from '@amplitude/element-selector';
import { querySelectorAllDeep, TimestampedEvent } from './helpers';
import { type ShadowGate, type ShadowMode } from './shadow-mode';
import { Observable, consoleObserver, getGlobalScope, merge } from '@amplitude/analytics-core';

/* eslint-disable-next-line no-restricted-globals */
const globalScope = getGlobalScope() as typeof window;

/** Read the gate's current mode. Only used on the shadow-capable path. */
const readGate = (gate: ShadowGate): ShadowMode => gate.get();

const MUTATION_OBSERVER_INIT: MutationObserverInit = {
  childList: true,
  attributes: true,
  characterData: true,
  subtree: true,
};

/**
 * Observe mutations across the main document and any open shadow roots.
 *
 * A single `MutationObserver` cannot see into shadow trees — `subtree: true`
 * stops at each boundary — so one observer is attached to every open shadow root
 * separately. Roots are discovered from two places: a recursive scan of the
 * existing DOM, and the observer's own callback, which checks each mutation's
 * `addedNodes` for roots that mount later. Both are bounded by the mode's depth
 * budget. Closed roots report `shadowRoot === null` and are skipped.
 *
 * The scan of existing DOM runs from `shadowGate.onArm` rather than inline,
 * because the gate is typically still off when the plugin builds its
 * observables and arms once remote config arrives. `onArm` fires on that arming
 * call, or synchronously if the gate is already armed, so the set of observed
 * roots does not depend on which happened first.
 *
 * When the mode is off, only `document.body` is observed.
 *
 * Known limitation: discovery is scan-based (DFS via `collectOpenShadowRoots`
 * on `addedNodes`), so a shadow root attached via `attachShadow` to an element
 * already in the DOM is not observed — that call emits no mutation record.
 * Mitigations and follow-ups: `packages/plugin-autocapture-browser/SHADOW-DOM.md`.
 */
export const createMutationObservable = (shadowGate?: ShadowGate): Observable<MutationRecord[]> => {
  if (!shadowGate) {
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
  }

  return new Observable<MutationRecord[]>((observer) => {
    // Track observed roots to avoid double-observing, plus the shadow-boundary
    // depth of each observed shadow root (the main document is depth 0). Both are
    // weak so shadow roots that unmount (common on component-heavy SPAs) are
    // reclaimable rather than pinned for the subscription's lifetime.
    const observed = new WeakSet<Node>();
    const rootDepth = new WeakMap<Node, number>();

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
      if (!(treeRoot instanceof ShadowRoot)) {
        return 0;
      }
      const recorded = rootDepth.get(treeRoot);
      /* istanbul ignore next -- defensive; every observed shadow root is depth-tagged at attach time */
      return recorded ?? 0;
    };

    const mutationObserver = new MutationObserver((mutations) => {
      observer.next(mutations);

      // Mutations are emitted first, then shadow discovery runs. The whole
      // branch is wrapped because this is a native callback: a throw here would
      // surface on the host page's `window.onerror`.
      try {
        const shadow = readGate(shadowGate);
        if (!shadow.enabled) {
          return;
        }
        // Attach to shadow roots that appeared since the last batch, recursing
        // into nested roots within the depth budget.
        for (const mutation of mutations) {
          const baseDepth = depthOfTree(mutation.target);
          mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) {
              observeShadowRootsWithin(node, baseDepth, shadow.maxDepth);
            }
          });
        }
      } catch {
        // Discovery failed for this batch. The mutations were already emitted.
      }
    });

    // Undefined when no gate was supplied, in which case no scan is registered.
    let cancelArmListener: (() => void) | undefined;

    if (document.body) {
      const body = document.body;
      observeRoot(body, 0);
      // Scans the existing DOM for open shadow roots. Runs on the arming call,
      // or synchronously here if the gate is already armed. Throws are contained
      // by the gate, so the document observer above stays attached either way.
      cancelArmListener = shadowGate.onArm((shadow) => {
        observeShadowRootsWithin(body, 0, shadow.maxDepth);
      });
    }

    // One disconnect detaches the observer from every root it was attached to.
    return () => {
      cancelArmListener?.();
      mutationObserver.disconnect();
    };
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
  shadowGate?: ShadowGate,
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

    const selectorString = selectorAllowlist.join(',');

    if (!shadowGate) {
      // Observe initial elements
      /* istanbul ignore next */
      const initialElements = globalScope?.document.querySelectorAll(selectorString) ?? [];
      initialElements.forEach((element) => {
        intersectionObserver.observe(element);
      });

      // Use mutation observable to observe new elements that match the allowlist
      const mutationSubscription = mutationObservable.subscribe(({ event }) =>
        event.forEach(({ addedNodes }) =>
          addedNodes.forEach((node) => {
            if (!(node instanceof Element)) {
              return;
            }
            if (node.matches(selectorString)) {
              intersectionObserver.observe(node);
            }
            node.querySelectorAll(selectorString).forEach((child) => {
              intersectionObserver.observe(child);
            });
          }),
        ),
      );

      return () => {
        mutationSubscription.unsubscribe();
        intersectionObserver.disconnect();
      };
    }

    // `querySelectorAll` runs against arbitrary customer DOM and throws
    // `SyntaxError` on a malformed `cssSelectorAllowlist` entry. This runs from
    // setup and from a native observer callback, neither of which has an SDK
    // boundary above it, so the throw is contained here: the remaining roots are
    // still scanned, and unmatched elements are simply not tracked.
    const observeMatchesInShadow = (root: Element | Document) => {
      try {
        querySelectorAllDeep(root, selectorString, readGate(shadowGate)).forEach((element) => {
          intersectionObserver.observe(element);
        });
      } catch {
        // Skip this root; discovery continues elsewhere.
      }
    };

    const observeMatches = (root: Element | Document) => {
      const shadow = readGate(shadowGate);
      if (!shadow.enabled) {
        root.querySelectorAll(selectorString).forEach((element) => {
          intersectionObserver.observe(element);
        });
        return;
      }
      observeMatchesInShadow(root);
    };

    // Elements present at subscription. Covers the light DOM only while the gate
    // is off, which is its state until remote config arms it.
    /* istanbul ignore next */
    if (globalScope?.document) {
      observeMatches(globalScope.document);
    }

    // Repeats the scan once the gate arms, which is what picks up elements
    // already inside shadow roots. `IntersectionObserver.observe` ignores a
    // target it is already observing, so re-walking the light DOM costs a
    // traversal and changes nothing.
    const cancelArmListener = shadowGate.onArm(() => {
      /* istanbul ignore next */
      if (globalScope?.document) {
        observeMatches(globalScope.document);
      }
    });

    // Use mutation observable to observe new elements that match the allowlist.
    const mutationSubscription = mutationObservable.subscribe(({ event }) =>
      event.forEach(({ addedNodes }) =>
        addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }
          const shadow = readGate(shadowGate);
          if (!shadow.enabled) {
            if (node.matches(selectorString)) {
              intersectionObserver.observe(node);
            }
            node.querySelectorAll(selectorString).forEach((child) => {
              intersectionObserver.observe(child);
            });
            return;
          }
          try {
            if (node.matches(selectorString)) {
              intersectionObserver.observe(node);
            }
          } catch {
            // Malformed selector — skip the self-match, still try descendants.
          }
          observeMatchesInShadow(node);
        }),
      ),
    );

    return () => {
      cancelArmListener();
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
