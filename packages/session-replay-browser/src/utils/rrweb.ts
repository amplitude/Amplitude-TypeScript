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
    inlineImages?: boolean;
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
    maskAttributeFn?: (key: string, value: string, element: HTMLElement) => string;
    maskTextSelector?: string;
    checkoutEveryNms?: number;
    recordCanvas?: boolean;
    /**
     * Partial rrweb sampling strategy. Only `canvas` is set by the SDK, from the local
     * `canvas.sampling` config: `'all'` records every drawing call, and a number records
     * image snapshots at most that many times per second.
     */
    sampling?: {
      canvas?: 'all' | number;
    };
    /**
     * Passed through from the local `canvas.dataURLOptions` config to rrweb's `dataURLOptions`.
     */
    dataURLOptions?: {
      type?: string;
      quality?: number;
    };
    slimDOMOptions?: {
      script?: boolean;
      comment?: boolean;
      headFavicon?: boolean;
      headWhitespace?: boolean;
      headMetaDescKeywords?: boolean;
      headMetaSocial?: boolean;
      headMetaRobots?: boolean;
      headMetaHttpEquiv?: boolean;
      headMetaAuthorship?: boolean;
      headMetaVerification?: boolean;
    };
    errorHandler?: (error: unknown) => boolean;
    plugins?: any[];
    applyBackgroundColorToBlockedElements?: boolean;
    /**
     * When true (default), adoptedStyleSheets CSS rules are serialized inline in the full snapshot
     * rather than emitted as separate incremental events that can be dropped in transit.
     * Set to false to revert to the legacy incremental-event path if snapshot size is a concern.
     */
    captureAdoptedStyleSheets?: boolean;
    recordCrossOriginIframes?: boolean;
  }): (() => void) | undefined;
  addCustomEvent: (eventName: string, eventData: any) => void;
  takeFullSnapshot: (isCheckout?: boolean) => void;
  mirror: Mirror;
};
