import { getGlobalScope } from '@amplitude/analytics-core';
import { CROSS_ORIGIN_IFRAME_MESSAGE_TYPE } from './constants';

export function isInIframe(): boolean {
  try {
    const globalScope = getGlobalScope() as Window | undefined;
    if (!globalScope) {
      return false;
    }
    return globalScope.parent !== globalScope;
  } catch {
    // SecurityError accessing window.parent in some sandboxed environments
    return true;
  }
}

type IframeMessage = { type: typeof CROSS_ORIGIN_IFRAME_MESSAGE_TYPE; action: 'start' | 'stop' };

/**
 * Manages the parent side of cross-origin iframe recording coordination.
 *
 * When the parent starts recording, it sends a start signal to all current child
 * iframes and watches for dynamically added iframes via MutationObserver. When the
 * parent stops, it sends a stop signal.
 */
export class CrossOriginIframeCoordinator {
  private mutationObserver: MutationObserver | undefined;
  // Tracks pending load listeners for dynamically added iframes so stop() can cancel them.
  private pendingLoadListeners = new Map<HTMLIFrameElement, () => void>();

  start() {
    this.mutationObserver?.disconnect(); // guard against double-start
    const globalScope = getGlobalScope();
    if (!globalScope) {
      return;
    }
    this.sendToAllIframes({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' });
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLIFrameElement) {
            // Send the start signal after the child page has loaded, not at insertion
            // time. At insertion the contentWindow is still about:blank; the message
            // sent there is discarded when the iframe navigates to its src, and the
            // child SDK never receives it.
            this.sendToIframeAfterLoad(node);
          } else if (node instanceof Element) {
            // A container element (e.g. a React-rendered div) may already have
            // iframe descendants when it is inserted. These iframes do NOT appear
            // in addedNodes — only the container does. Query the subtree so we
            // don't miss them.
            node.querySelectorAll<HTMLIFrameElement>('iframe').forEach((iframe) => {
              this.sendToIframeAfterLoad(iframe);
            });
          }
        }
        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof HTMLIFrameElement) {
            const listener = this.pendingLoadListeners.get(node);
            if (listener) {
              node.removeEventListener('load', listener);
              this.pendingLoadListeners.delete(node);
            }
          }
        }
      }
    });
    this.mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  stop() {
    this.mutationObserver?.disconnect();
    this.mutationObserver = undefined;
    // Cancel any start signals that were waiting for a pending iframe load.
    this.pendingLoadListeners.forEach((listener, iframe) => {
      iframe.removeEventListener('load', listener);
    });
    this.pendingLoadListeners.clear();
    this.sendToAllIframes({ type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'stop' });
  }

  private sendToIframeAfterLoad(iframe: HTMLIFrameElement) {
    const sendStart = () => {
      this.pendingLoadListeners.delete(iframe);
      this.sendToIframe(iframe, { type: CROSS_ORIGIN_IFRAME_MESSAGE_TYPE, action: 'start' });
    };
    this.pendingLoadListeners.set(iframe, sendStart);
    iframe.addEventListener('load', sendStart, { once: true });
  }

  private sendToAllIframes(message: IframeMessage) {
    const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe');
    iframes.forEach((iframe) => this.sendToIframe(iframe, message));
  }

  private sendToIframe(iframe: HTMLIFrameElement, message: IframeMessage) {
    try {
      iframe.contentWindow?.postMessage(message, '*');
    } catch {
      // Cross-origin postMessage can throw in some sandboxed environments; ignore.
    }
  }
}

/**
 * Listens for start/stop signals from the parent page and invokes the provided
 * callbacks. Only messages from `window.parent` are accepted.
 *
 * Returns a cleanup function that removes the message listener.
 */
export function listenForParentSignals(callbacks: { onStart: () => void; onStop: () => void }): () => void {
  const globalScope = getGlobalScope() as Window | undefined;
  if (!globalScope) {
    return () => undefined;
  }

  const parentFrame = globalScope.parent;

  function handler(event: MessageEvent) {
    // Only accept messages from the direct parent frame.
    if (event.source !== parentFrame) {
      return;
    }
    const data = event.data as Partial<IframeMessage>;
    if (data?.type !== CROSS_ORIGIN_IFRAME_MESSAGE_TYPE) {
      return;
    }
    if (data.action === 'start') {
      callbacks.onStart();
    } else if (data.action === 'stop') {
      callbacks.onStop();
    }
  }

  globalScope.addEventListener('message', handler);
  return () => globalScope.removeEventListener('message', handler);
}
