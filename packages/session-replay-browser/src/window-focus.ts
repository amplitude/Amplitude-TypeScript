import { getGlobalScope } from '@amplitude/analytics-core';

/**
 * Decides when focus arrived from outside this window.
 *
 * A blur whose next frame lands on an iframe stayed in this page. Anything else
 * left the window. The parent is already blurred once an iframe is focused, so
 * that iframe's window is watched too: moving into a nested frame is not a
 * leave, and moving from the frame to another visible window is.
 */
export class WindowFocusTracker {
  private focusLeftWindow = false;
  private focusDestinationFrame: number | undefined;
  private focusedFrameWindow: Window | undefined;
  private focusedFrameBlur: (() => void) | undefined;

  /** Call from the window `blur` listener. `activeElement` is not updated yet. */
  noteBlur(): void {
    this.focusLeftWindow = false;
    this.cancelFocusDestinationCheck();
    const scope = getGlobalScope();
    this.scheduleFocusInspect(scope, () => {
      const active = scope?.document?.activeElement;
      if (active?.tagName === 'IFRAME') {
        this.watchFocusedFrame(active as HTMLIFrameElement);
        return;
      }
      this.releaseFocusedFrame();
      this.focusLeftWindow = true;
    });
  }

  /** The document hid. Drop the iframe watcher; visibility owns the checkout. */
  onDocumentHidden(): void {
    this.releaseFocusedFrame();
  }

  /**
   * The document was shown. Drop the external-focus flag so the focus event
   * that follows a tab return does not take a second checkout.
   */
  onDocumentVisible(): void {
    this.focusLeftWindow = false;
    this.cancelFocusDestinationCheck();
    this.releaseFocusedFrame();
  }

  /**
   * Call from the window `focus` listener. True when focus arrived from outside
   * this window while the document stayed visible.
   */
  consumeArrivedFromOutside(): boolean {
    const arrivedFromOutside = this.focusLeftWindow && getGlobalScope()?.document?.visibilityState === 'visible';
    this.focusLeftWindow = false;
    this.releaseFocusedFrame();
    return arrivedFromOutside;
  }

  stop(): void {
    this.focusLeftWindow = false;
    this.cancelFocusDestinationCheck();
    this.releaseFocusedFrame();
  }

  private noteFrameBlur() {
    this.cancelFocusDestinationCheck();
    const scope = getGlobalScope();
    this.scheduleFocusInspect(scope, () => {
      const active = scope?.document?.activeElement;
      const parentDocument = scope?.document;
      const parentHasFocus = typeof parentDocument?.hasFocus === 'function' && parentDocument.hasFocus();
      if (parentHasFocus || active?.tagName !== 'IFRAME') {
        this.releaseFocusedFrame();
        return;
      }
      const holder = this.focusHolder(active as HTMLIFrameElement);
      if (holder) {
        this.watchFocusedFrame(holder);
        return;
      }
      this.focusLeftWindow = true;
    });
  }

  /**
   * The iframe that still holds focus, walking into nested frames. Undefined means
   * the frame's document is visible and neither it nor a child frame is focused.
   */
  private focusHolder(frame: HTMLIFrameElement, seen?: Set<HTMLIFrameElement>): HTMLIFrameElement | undefined {
    if (seen?.has(frame)) {
      return frame;
    }
    const visited = seen ?? new Set<HTMLIFrameElement>();
    visited.add(frame);
    let doc: Document | null | undefined;
    try {
      doc = frame.contentDocument;
    } catch {
      // A cross-origin frame is still part of this page.
      return frame;
    }
    if (doc == null) {
      return frame;
    }
    if (typeof doc.hasFocus === 'function' && doc.hasFocus()) {
      return frame;
    }
    const inner = doc.activeElement;
    if (inner?.tagName === 'IFRAME') {
      return this.focusHolder(inner as HTMLIFrameElement, visited);
    }
    return undefined;
  }

  private watchFocusedFrame(frame: HTMLIFrameElement) {
    this.releaseFocusedFrame();
    let child: Window | null | undefined;
    try {
      child = frame.contentWindow;
    } catch {
      return;
    }
    if (child == null || typeof child.addEventListener !== 'function') {
      return;
    }
    const onBlur = () => {
      this.noteFrameBlur();
    };
    try {
      child.addEventListener('blur', onBlur);
    } catch {
      return;
    }
    this.focusedFrameWindow = child;
    this.focusedFrameBlur = onBlur;
  }

  private releaseFocusedFrame() {
    const child = this.focusedFrameWindow;
    const onBlur = this.focusedFrameBlur;
    this.focusedFrameWindow = undefined;
    this.focusedFrameBlur = undefined;
    if (child === undefined) {
      return;
    }
    try {
      child.removeEventListener('blur', onBlur as () => void);
    } catch {
      // The frame can reject listener removal once it is cross-origin.
    }
  }

  private scheduleFocusInspect(scope: ReturnType<typeof getGlobalScope>, inspect: () => void) {
    const run = () => {
      this.focusDestinationFrame = undefined;
      inspect();
    };
    if (typeof scope?.requestAnimationFrame === 'function') {
      this.focusDestinationFrame = scope.requestAnimationFrame(run);
      return;
    }
    run();
  }

  private cancelFocusDestinationCheck() {
    if (this.focusDestinationFrame === undefined) {
      return;
    }
    const scope = getGlobalScope();
    if (typeof scope?.cancelAnimationFrame === 'function') {
      scope.cancelAnimationFrame(this.focusDestinationFrame);
    }
    this.focusDestinationFrame = undefined;
  }
}
