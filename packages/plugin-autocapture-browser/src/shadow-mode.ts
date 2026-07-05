/**
 * Resolves whether the capture layer crosses shadow boundaries, and how deep.
 *
 * {@link ShadowMode} is a union, so `enabled: true` always carries a positive
 * crossing budget and off is a single value ({@link SHADOW_OFF}). Callers branch
 * on `enabled` and read `maxDepth` only in the enabled arm.
 *
 * {@link ShadowGate} holds the mode for the page. It starts off and latches on
 * the first remote-config delivery that enables shadow support, notifying
 * `onArm` subscribers so they can run their one-time discovery scans (attaching
 * MutationObservers to existing shadow roots, registering in-shadow elements for
 * exposure). Subsequent deliveries do not change it — including one that
 * disables shadow support, which takes effect on the next page load.
 *
 * The gate is read on every captured event and on every observer callback.
 * Latching means those reads always agree with each other and with the scans
 * already performed, without threading the mode through every call.
 *
 * Rollout limitations (open roots only, latch-once per page, late
 * `attachShadow` discovery, DFS performance) are documented in
 * `packages/plugin-autocapture-browser/SHADOW-DOM.md`.
 */

import type { ResolvedSelectorConfig } from '@amplitude/element-selector';

/** Shadow piercing on. `maxDepth` is the number of boundaries a walk may cross. */
export type ShadowOn = { readonly enabled: true; readonly maxDepth: number };

/** Shadow piercing off. `maxDepth` is pinned to 0 so no walk can cross. */
export type ShadowOff = { readonly enabled: false; readonly maxDepth: 0 };

/** Whether the capture layer crosses shadow boundaries, and how deep. */
export type ShadowMode = ShadowOn | ShadowOff;

/** The off value. Shared rather than reconstructed, so identity checks hold. */
export const SHADOW_OFF: ShadowOff = Object.freeze({ enabled: false, maxDepth: 0 });

/**
 * Project a resolved selector config onto a {@link ShadowMode}. A zero or
 * negative budget resolves to off, since an enabled mode that cannot cross a
 * boundary would behave as off while reading as on. The config resolver already
 * clamps into `[1, MAX_SHADOW_DOM_DEPTH]`; this covers a config that bypassed it.
 */
export const shadowModeFromConfig = (
  config: Pick<ResolvedSelectorConfig, 'shadowDomEnabled' | 'maxShadowDomDepth'>,
): ShadowMode => {
  if (!config.shadowDomEnabled || !(config.maxShadowDomDepth > 0)) {
    return SHADOW_OFF;
  }
  return Object.freeze({ enabled: true as const, maxDepth: config.maxShadowDomDepth });
};

/** Holds the {@link ShadowMode} for a page, transitioning from off to on once. */
export interface ShadowGate {
  /** The current mode: {@link SHADOW_OFF} until armed, then the armed mode. */
  get(): ShadowMode;

  /**
   * Apply a resolved mode. Takes effect only on the first call with an enabled
   * mode, which also notifies `onArm` subscribers. Later calls are ignored,
   * including one carrying {@link SHADOW_OFF}. Returns the current mode.
   */
  arm(mode: ShadowMode): ShadowMode;

  /**
   * Register `cb` to run when the gate arms, or synchronously if it is already
   * armed. Observables use this to run their shadow discovery scan once, whether
   * they subscribed before or after the arming config arrived. Returns an
   * unsubscribe function.
   */
  onArm(cb: (mode: ShadowOn) => void): () => void;
}

export const createShadowGate = (): ShadowGate => {
  let mode: ShadowMode = SHADOW_OFF;
  const listeners = new Set<(mode: ShadowOn) => void>();

  // Subscribers walk arbitrary customer DOM, so isolate their throws: one
  // failing scan must not skip the remaining subscribers, and must not
  // propagate into the remote-config callback that triggered the arming.
  const notify = (armedMode: ShadowOn) => {
    for (const cb of [...listeners]) {
      try {
        cb(armedMode);
      } catch {
        // A failed scan leaves that subscriber with less coverage, nothing more.
      }
    }
    // Arming occurs at most once, so these listeners are never called again.
    listeners.clear();
  };

  return {
    get: () => mode,

    arm: (next) => {
      if (mode.enabled || !next.enabled) {
        return mode;
      }
      mode = next;
      notify(next);
      return mode;
    },

    onArm: (cb) => {
      if (mode.enabled) {
        const armedMode = mode;
        try {
          cb(armedMode);
        } catch {
          // As in `notify`: a failed scan must not propagate to the subscriber.
        }
        return () => undefined;
      }
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
};

/**
 * One gate per page rather than per `DataExtractor`. autocapture-plugin and
 * frustration-plugin build separate extractors and subscribe to remote config
 * independently, and both must resolve the same mode. Mirrors the shared
 * selector-engine singleton in `data-extractor.ts`.
 */
let sharedShadowGate: ShadowGate | undefined;

export const getSharedShadowGate = (): ShadowGate => {
  if (!sharedShadowGate) {
    sharedShadowGate = createShadowGate();
  }
  return sharedShadowGate;
};

/**
 * Test-only. `arm` cannot move the gate back to off, so tests that exercise the
 * enabled path replace the singleton to return to the off mode.
 */
export const resetSharedShadowGateForTesting = (): void => {
  sharedShadowGate = undefined;
};
