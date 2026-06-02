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

import { ResolvedSelectorConfig, SelectorEngine } from './types';
import { runOrchestrator, OrchestratorOptions } from './orchestrator';
import { fallbackCssPath } from './fallback-css-path';

export interface CreateSelectorEngineOptions {
  /** Optional document or shadow root for uniqueness checks. Defaults per-call to the target's owner document. */
  scope?: ParentNode;
  /** Optional override of the strategy chain. Primarily for testing / dashboard ad-hoc runs. */
  strategies?: OrchestratorOptions['strategies'];
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

  const orchestratorOptions: OrchestratorOptions = {
    strategies: options.strategies,
    scope: options.scope,
  };

  return {
    generate(el: Element): string {
      // Try the strategy chain first.
      const composed = runOrchestrator(el, config, orchestratorOptions);
      if (composed !== null) {
        return composed;
      }
      // Strategy chain found nothing usable — fall back to the hardened
      // positional walker.
      return fallbackCssPath(el, config);
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
        } catch (_e) {
          // Intentionally swallowed. Logger integration arrives in the
          // verification PR alongside `@amplitude/analytics-core`.
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
