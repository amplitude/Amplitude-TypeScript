/**
 * Engine factory — composes the strategy chain (via `runOrchestrator`) with
 * the safety-net fallback (`fallbackCssPath`) behind a single `SelectorEngine`
 * interface.
 *
 * This is the surface every consumer talks to:
 *
 *   - autocapture SDK plugin → instantiates one engine per init() call,
 *     wires it into the click handler, and forwards remote-config updates
 *     via `updateConfig`.
 *   - app.amplitude.com tagging UI → fetches the customer's remote config
 *     out-of-band and stands up a transient engine to compute selectors for
 *     elements the user clicks in the iframe.
 *   - Chrome extension visual tagger → reads the customer's already-live
 *     engine off `window.amplitude.elementSelector` (when present) and
 *     subscribes to `onConfigChange` so the extension's preview stays in
 *     sync with the customer's runtime config.
 *
 * The factory deliberately takes a pre-resolved `ResolvedSelectorConfig` rather
 * than the raw remote payload — config resolution is a separate concern handled
 * by `resolveSelectorConfig`, and keeping it out of the engine constructor lets
 * dashboard / extension consumers stand up an engine from a static snapshot
 * without re-running the full resolver.
 *
 * See the design doc:
 *   packages/plugin-autocapture-browser/element-selector-strategy-v1-no-classes.md
 */

import { ElementSelectorLogger, ResolvedSelectorConfig, SelectorEngine } from './types';
import { runOrchestrator, OrchestratorOptions } from './orchestrator';
import { fallbackCssPath } from './fallback-css-path';
import { safeLegacyCssPath } from './legacy-css-path';
import {
  anchorSegmentToShadowScope,
  legacyPathIsRootAnchored,
  segmentWalk,
  SHADOW_BOUNDARY_DELIMITER,
} from './helpers/shadow';

/**
 * Produce a selector for `target` that is resolvable **within a single tree**,
 * using `scope` (a `Document` or `ShadowRoot`) for uniqueness checks. The two
 * implementations below are the `config.enabled` axis; `pierce` composes one of
 * them across shadow boundaries for the `config.shadowDomEnabled` axis.
 */
type TreeSelector = (target: Element, scope: ParentNode) => string;

export interface CreateSelectorEngineOptions {
  /** Optional document or shadow root for uniqueness checks. Defaults per-call to the target's owner document. */
  scope?: ParentNode;
  /** Optional override of the strategy chain. Primarily for testing / dashboard ad-hoc runs. */
  strategies?: OrchestratorOptions['strategies'];
  /**
   * Optional logger threaded through the orchestrator and the subscriber-fan-out
   * inside `updateConfig`. When provided, the engine surfaces malformed
   * selectors (`debug`) and listener exceptions (`warn`); when absent it stays
   * silent — preserving the legacy "fire-and-forget" semantics existing
   * consumers may rely on.
   */
  logger?: ElementSelectorLogger;
}

/**
 * Build a `SelectorEngine` bound to the supplied config.
 *
 * The returned engine is independent — calling the factory twice yields two
 * engines with separate config state and separate subscriber lists. This is the
 * shape the autocapture plugin wants (one engine per SDK instance) and the
 * shape the Chrome extension consumes off the page (the extension reads, never
 * writes).
 */
export function createSelectorEngine(
  initialConfig: ResolvedSelectorConfig,
  options: CreateSelectorEngineOptions = {},
): SelectorEngine {
  let config: ResolvedSelectorConfig = initialConfig;
  const subscribers = new Set<(config: ResolvedSelectorConfig) => void>();
  const logger = options.logger;

  // ── Per-tree algorithms: the `config.enabled` axis ────────────────────────

  /**
   * LEGACY algorithm
   * The algorithm has no notion of scope.
   */
  const legacyTree: TreeSelector = (target) => safeLegacyCssPath(target, logger);

  /**
   * ENGINE algorithm: the strategy chain, then the hardened fallback, both
   * scoped to the tree's own root.
   */
  const engineTree: TreeSelector = (target, scope) =>
    runOrchestrator(target, config, { strategies: options.strategies, scope, logger }) ??
    fallbackCssPath(target, config, { scope });

  // ── Shadow-aware variant: reachable ONLY from `pierce` ────────────────────

  /**
   * `legacyCssPath` ignores scope, so for a shadow-tree element with no id
   * ancestor it emits an unanchored positional chain that `querySelector` would
   * match tree-wide. Anchor such a chain so `resolveSelector` descends by direct
   * child instead. `engineTree` needs no counterpart — `fallbackCssPath` anchors
   * its own output from the scope it is handed.
   */
  const legacyTreeInShadow: TreeSelector = (target, scope) =>
    anchorSegmentToShadowScope(legacyTree(target, scope), scope, legacyPathIsRootAnchored(target));

  /**
   * Split the outward walk into per-tree segments (capped at `maxShadowDomDepth`
   * boundary crossings), run `perTree` for each segment scoped to that tree's
   * root, and join the results with the boundary delimiter. Passing the per-tree
   * generator as a callback keeps "how to select within one tree" in one place
   * and lets both the legacy and engine algorithms reuse the same walk.
   */
  function pierce(el: Element, perTree: TreeSelector): string {
    const { segments, truncated } = segmentWalk(el, config.maxShadowDomDepth);
    if (truncated) {
      logger?.debug(
        `@amplitude/element-selector: target is nested deeper than maxShadowDomDepth (${config.maxShadowDomDepth}) — emitting a best-effort selector for the outermost in-budget shadow host`,
      );
    }
    return segments.map(({ target, root }) => perTree(target, root)).join(SHADOW_BOUNDARY_DELIMITER);
  }

  return {
    generate(el: Element): string {
      // Two independent switches:
      //
      //   config.enabled          → which per-tree algorithm runs (engine vs legacy)
      //   config.shadowDomEnabled → whether we pierce boundaries or stay in one tree
      //
      // One try/catch covers all four corners. It is the safety net: a runtime
      // exception (malformed config slipped past the resolver, browser API
      // quirks, a bad scope, a pathological host chain) still produces a usable
      // selector rather than throwing mid-capture and silently dropping the
      // customer's event.
      try {
        if (!config.shadowDomEnabled) {
          const perTree = config.enabled ? engineTree : legacyTree;
          return perTree(el, options.scope ?? el.ownerDocument ?? document);
        }
        return pierce(el, config.enabled ? engineTree : legacyTreeInShadow);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger?.warn(
          `@amplitude/element-selector: selector generation threw — falling back to legacy cssPath: ${message}`,
        );
        return safeLegacyCssPath(el, logger);
      }
    },

    getConfig(): Readonly<ResolvedSelectorConfig> {
      return config;
    },

    updateConfig(next: ResolvedSelectorConfig): void {
      config = next;
      // Notify subscribers in insertion order. Errors thrown by individual
      // subscribers are isolated so one bad listener can't break the others —
      // the extension's listener is the canonical consumer here and we don't
      // want SDK-side changes to cascade-fail because of an extension bug.
      for (const cb of subscribers) {
        try {
          cb(next);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          logger?.warn(`@amplitude/element-selector: onConfigChange subscriber threw — ${message}`);
        }
      }
    },

    onConfigChange(cb: (config: ResolvedSelectorConfig) => void): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
