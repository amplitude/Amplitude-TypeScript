import { getGlobalScope } from '@amplitude/analytics-core';
import type { eventWithTime, scrollCallback } from '@amplitude/rrweb-types';

// These functions are not exposed in rrweb package, so we will define it here to use
// Ignoring this function since this is copied from rrweb
export function getViewportHeight(): number {
  const globalScope = getGlobalScope();
  return globalScope?.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
}

export function getViewportWidth(): number {
  const globalScope = getGlobalScope();
  return globalScope?.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
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
    slimDOMOptions?: {
      script?: boolean;
      comment?: boolean;
    };
    errorHandler?: (error: unknown) => boolean;
    plugins?: any[];
    applyBackgroundColorToBlockedElements?: boolean;
  }): (() => void) | undefined;
  addCustomEvent: (eventName: string, eventData: any) => void;
  mirror: Mirror;
};
