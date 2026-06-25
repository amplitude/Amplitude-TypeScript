/**
 * Top-level chokepoint for "generate a selector for this element."
 *
 * Both the SDK plugin (`plugin-autocapture-browser`) and the dashboard
 * (`session-replay-ui`) used to maintain their own copy of this routing logic:
 *
 *     if (config.enabled && engine) return engine.generate(el);
 *     else return cssPath(el, false);
 *
 * Two consumers, two routers, two locally-bundled copies of `cssPath`. As soon
 * as we considered a third consumer (Chrome extension visual tagger, future
 * tagging surfaces) the duplication became untenable — bug fixes had to land
 * three places and the kill-switch semantics could drift between them.
 *
 * Moving the kill switch inside `engine.generate` covered the "engine present"
 * case. This helper covers the remaining "engine is null" case that some
 * consumers genuinely have:
 *
 *   - dashboard's `useElementSelectorEngineContext()` returns
 *     `{ engine: null }` when no provider is mounted (tests, content-renderer
 *     paths, future call sites outside the canonical mount tree).
 *   - Chrome extension boots before the customer's SDK has stood up an engine
 *     on the page; reads `null` from `window.amplitude.elementSelector` until
 *     the SDK init finishes.
 *
 * In those cases, callers want the legacy `cssPath` selector — same shape the
 * SDK is emitting in production for orgs without the engine. This helper makes
 * that explicit and centralizes the rule so future consumers don't reinvent
 * it.
 */

import { ResolvedSelectorConfig, SelectorEngine } from './types';
import { safeLegacyCssPath } from './legacy-css-path';

/**
 * Generate a selector for `el`, transparently routing to the legacy
 * `cssPath` walker when no engine is available.
 *
 * Why this signature (engine + config separately, rather than just engine):
 * the dashboard's inert context has `engine: null` but still carries a
 * resolved config. Both `null`-engine and engine-with-`enabled: false`
 * collapse to "legacy `cssPath`", and we want the same one-line call site
 * to handle both. When the engine *is* present, this just delegates — the
 * engine's own kill switch handles `enabled === false`.
 *
 * Never throws. Returns the empty string in the pathological case where the
 * legacy walker itself can't produce one (non-element nodes; environments
 * missing `CSS.escape`).
 *
 * @param el      DOM element to identify.
 * @param engine  Live `SelectorEngine`, or `null` when no engine is mounted.
 * @param config  Resolved selector config. Only consulted in the null-engine
 *                branch; when `engine` is present, the engine consults its
 *                own internal config.
 */
export const generateSelector = (
  el: Element,
  engine: SelectorEngine | null,
  config: ResolvedSelectorConfig,
): string => {
  if (engine) {
    // The engine has its own kill switch (`config.enabled === false` →
    // legacy cssPath) and its own try/catch safety net. Trust it.
    return engine.generate(el);
  }
  // Engine-null branch. We don't have a live engine to consult, so we route
  // straight to the legacy walker — the same selector the SDK would be
  // emitting if `config.enabled === false`.
  //
  // `config` is intentionally inert here: call sites with `engine: null`
  // (boot-time Chrome extension, inert dashboard context) have no strategy
  // engine to run. Passing `enabled: true` cannot take effect without a live
  // engine — legacyCssPath is the only output available. `config` is accepted
  // for signature symmetry with the engine-present branch and so future
  // versions can extend behavior without a breaking change.
  void config;
  return safeLegacyCssPath(el);
};
