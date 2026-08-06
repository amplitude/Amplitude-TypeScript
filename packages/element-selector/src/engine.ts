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

  /**
   * Single-tree generator for the LEGACY algorithm (the `enabled === false`
   * kill switch). Legacy `cssPath` has no notion of scope: for a shadow-tree
   * element with no id ancestor it emits an unanchored positional chain that
   * `querySelector` would match tree-wide. When `scope` is a shadow root we
   * anchor a root-anchored chain so `resolveSelector` descends by direct child —
   * the same treatment `engineTree`'s fallback applies. For a document scope the
   * anchor is a no-op.
   */
  function legacyTree(target: Element, scope: ParentNode): string {
    const legacy = safeLegacyCssPath(target, logger);
    return anchorSegmentToShadowScope(legacy, scope, legacyPathIsRootAnchored(target));
  }

  /**
   * Single-tree generator for the ENGINE algorithm: the strategy chain, then the
   * hardened fallback, both scoped to the tree's own root. `runOrchestrator`
   * defaults an omitted scope to the owner document.
   */
  function engineTree(target: Element, scope: ParentNode): string {
    const composed = runOrchestrator(target, config, { strategies: options.strategies, scope, logger });
    if (composed !== null) {
      return composed;
    }
    return fallbackCssPath(target, config, { scope });
  }

  /**
   * Shadow-piercing wrapper around a single-tree generator.
   *
   * When piercing is off, runs `perTree` once against the element's own tree.
   * When on, splits the outward walk into per-tree segments (capped at
   * `maxShadowDomDepth` boundary crossings), runs `perTree` for each segment
   * scoped to that tree's root, and joins the results with the boundary
   * delimiter. `perTree` describes how to select within one tree; passing it as
   * a callback keeps that logic in one place and lets both the legacy and engine
   * algorithms reuse the same walk. The walk is guarded so a throw degrades to a
   * legacy selector instead of escaping to the caller.
   */
  function withShadow(el: Element, perTree: (target: Element, scope: ParentNode) => string): string {
    if (!config.shadowDomEnabled) {
      return perTree(el, options.scope ?? el.ownerDocument ?? document);
    }
    try {
      const { segments, truncated } = segmentWalk(el, config.maxShadowDomDepth);
      if (truncated) {
        logger?.debug(
          `@amplitude/element-selector: target is nested deeper than maxShadowDomDepth (${config.maxShadowDomDepth}) — emitting a best-effort selector for the outermost in-budget shadow host`,
        );
      }
      return segments.map(({ target, root }) => perTree(target, root)).join(SHADOW_BOUNDARY_DELIMITER);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger?.warn(`@amplitude/element-selector: shadow walk threw — falling back to legacy cssPath: ${message}`);
      return safeLegacyCssPath(el, logger);
    }
  }

  return {
    generate(el: Element): string {
      // Kill switch: when the customer's remote config has the engine
      // disabled (the default for orgs that haven't opted in), emit the same
      // Chromium-derived selector autocapture has shipped since before the
      // strategy chain existed. This is what makes "flip enabled back to
      // false" a one-config-fetch revert for both the SDK and the dashboard —
      // they both go through this entry point now. `withShadow` gates piercing
      // around it.
      if (!config.enabled) {
        return withShadow(el, legacyTree);
      }

      // Engine path: the strategy chain, then the hardened fallback (see
      // `engineTree`), gated by `withShadow`. The try/catch is the safety net:
      // a runtime exception (malformed config slipped past the resolver, browser
      // API quirks, a bad scope) still produces a usable selector rather than
      // throwing mid-capture and silently dropping the customer's event.
      try {
        return withShadow(el, engineTree);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger?.warn(`@amplitude/element-selector: strategy chain threw — falling back to legacy cssPath: ${message}`);
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
