import { getGlobalScope } from '@amplitude/analytics-core';
import type { DeferFullSnapshotConfig } from '../config/types';

/**
 * Which condition released a deferred recording start.
 *
 * - `load`: the window `load` event fired (or the document was already complete) and `until`
 *   was `'load'`.
 * - `idle`: the post-`load` idle callback fired (`until: 'idle'`).
 * - `delay`: the configured `delayMs` elapsed after `until` was satisfied.
 * - `max-wait`: `maxWaitMs` elapsed before the milestone; recording started anyway.
 */
export type DeferredRecordStartResolution = 'load' | 'idle' | 'delay' | 'max-wait';

export interface DeferredRecordStartResult {
  /** Wall-clock milliseconds the recording start was held back. */
  waitedMs: number;
  resolvedBy: DeferredRecordStartResolution;
}

type IdleScope = {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Resolves once the page has reached the configured milestone (`load`, optionally followed by
 * an idle period and a fixed delay), or once `maxWaitMs` elapses — whichever comes first. Every
 * listener/timer it installs is torn down on resolution so nothing lingers after the start.
 *
 * The caller decides whether the start is still wanted when the promise settles (e.g. `stop()`
 * or a session change may have happened in the meantime); this helper only answers "is the
 * page ready for the snapshot yet?".
 */
export function waitForDeferredRecordStart(
  config: Required<DeferFullSnapshotConfig>,
): Promise<DeferredRecordStartResult> {
  const { until, delayMs, maxWaitMs } = config;
  const startedAt = Date.now();
  const globalScope = getGlobalScope() as (Window & IdleScope) | undefined;

  return new Promise<DeferredRecordStartResult>((resolve) => {
    let settled = false;
    const cleanups: Array<() => void> = [];

    const finish = (resolvedBy: DeferredRecordStartResolution) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          // Best-effort teardown; a failed cleanup must not block the start.
        }
      }
      resolve({ waitedMs: Date.now() - startedAt, resolvedBy });
    };

    const maxWaitTimer = setTimeout(() => finish('max-wait'), maxWaitMs);
    cleanups.push(() => clearTimeout(maxWaitTimer));

    const afterMilestone = (resolvedBy: DeferredRecordStartResolution) => {
      if (delayMs > 0) {
        const delayTimer = setTimeout(() => finish('delay'), delayMs);
        cleanups.push(() => clearTimeout(delayTimer));
        return;
      }
      finish(resolvedBy);
    };

    const afterLoad = () => {
      if (until !== 'idle') {
        afterMilestone('load');
        return;
      }
      if (globalScope && typeof globalScope.requestIdleCallback === 'function') {
        const handle = globalScope.requestIdleCallback(() => afterMilestone('idle'));
        cleanups.push(() => globalScope.cancelIdleCallback?.(handle));
        return;
      }
      // No requestIdleCallback (e.g. Safari): yield one macrotask after load so the
      // browser gets a chance to paint before the snapshot runs.
      const idleFallbackTimer = setTimeout(() => afterMilestone('idle'), 0);
      cleanups.push(() => clearTimeout(idleFallbackTimer));
    };

    const document = globalScope?.document;
    if (!globalScope || !document || document.readyState === 'complete') {
      afterLoad();
      return;
    }

    const onLoad = () => afterLoad();
    globalScope.addEventListener('load', onLoad);
    cleanups.push(() => globalScope.removeEventListener('load', onLoad));
  });
}
