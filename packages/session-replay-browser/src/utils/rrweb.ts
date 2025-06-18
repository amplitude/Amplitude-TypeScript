import { getGlobalScope } from '@amplitude/analytics-core';
import dom from '@amplitude/rrweb-utils';
import type { eventWithTime, scrollCallback } from '@amplitude/rrweb-types';

// These functions are not exposed in rrweb package, so we will define it here to use
// Ignoring this function since this is copied from rrweb
/* istanbul ignore next */
export function getWindowScroll(win: Window) {
  const doc = win.document;
  return {
    left: doc.scrollingElement
      ? doc.scrollingElement.scrollLeft
      : win.pageXOffset !== undefined
      ? win.pageXOffset
      : doc.documentElement.scrollLeft ||
        (doc?.body && dom.parentElement(doc.body)?.scrollLeft) ||
        doc?.body?.scrollLeft ||
        0,
    top: doc.scrollingElement
      ? doc.scrollingElement.scrollTop
      : win.pageYOffset !== undefined
      ? win.pageYOffset
      : doc?.documentElement.scrollTop ||
        (doc?.body && dom.parentElement(doc.body)?.scrollTop) ||
        doc?.body?.scrollTop ||
        0,
  };
}

export function getWindowHeight(): number {
  const globalScope = getGlobalScope();
  return (
    globalScope?.innerHeight ||
    (document.documentElement && document.documentElement.clientHeight) ||
    (document.body && document.body.clientHeight) ||
    0
  );
}

export function getWindowWidth(): number {
  const globalScope = getGlobalScope();
  return (
    globalScope?.innerWidth ||
    (document.documentElement && document.documentElement.clientWidth) ||
    (document.body && document.body.clientWidth) ||
    0
  );
}

export type Mirror = {
  getNode: (id: number) => Node | null;
};

export type RecordFunction = {
  (options: {
    emit: (event: eventWithTime) => void;
    inlineStylesheet?: boolean;
    hooks?: {
      mouseInteraction?: any;
      scroll?: scrollCallback;
    };
    maskAllInputs?: boolean;
    maskTextClass?: string;
    blockClass?: string;
    blockSelector?: string;
    maskInputFn?: (text: string, element: HTMLElement | null) => string;
    maskTextFn?: (text: string, element: HTMLElement | null) => string;
    maskTextSelector?: string;
    recordCanvas?: boolean;
    errorHandler?: (error: unknown) => boolean;
    plugins?: any[];
    applyBackgroundColorToBlockedElements?: boolean;
  }): (() => void) | undefined;
  addCustomEvent: (eventName: string, eventData: any) => void;
  mirror: Mirror;
};
