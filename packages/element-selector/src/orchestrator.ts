/**
 * Orchestrator — the entry point for the v1 element-selector algorithm.
 *
 * Given a click target, the orchestrator walks from the target up through its
 * ancestors and tries each registered strategy at each level. The first
 * strategy that returns a non-null candidate (and produces a selector that
 * resolves uniquely under the scope) wins; the trail of intermediate elements
 * between the anchor and the original target is then expressed as a positional
 * descent via `describeRelative`.
 *
 * Two-pass design: every ancestor is tried under the `explicitTrackingAttribute`
 * strategy first, then the entire walk repeats with `stableId`. This ordering
 * means an explicit anchor anywhere up the tree always beats a stable id deeper
 * down — the design doc describes this as the "customer intent overrides
 * structural inference" rule.
 *
 * The orchestrator does not own the fallback. When no strategy + walk produces
 * a unique selector, it returns `null` and the engine wires the
 * `fallback-css-path` path in instead. Keeping the fallback outside the
 * orchestrator keeps the strategy chain testable in isolation.
 *
 * See the design doc:
 *   packages/plugin-autocapture-browser/element-selector-strategy-v1-no-classes.md
 */

import { ElementSelectorLogger, ResolvedSelectorConfig, Strategy, StrategyContext } from './types';
import { explicitTrackingAttribute } from './strategies/explicit-tracking-attribute';
import { stableId as stableIdStrategy } from './strategies/stable-id';
import { describeRelative } from './helpers/describe-relative';

/**
 * Default strategy chain in priority order. Used by the engine factory when the
 * caller doesn't provide an explicit list. Exported for diagnostics — tests
 * import this so they don't have to duplicate the list.
 */
export const DEFAULT_STRATEGIES: ReadonlyArray<Strategy> = [explicitTrackingAttribute, stableIdStrategy];

export interface OrchestratorOptions {
  /** Strategy chain. Defaults to `DEFAULT_STRATEGIES`. Order = priority. */
  strategies?: ReadonlyArray<Strategy>;
  /** Document or shadow root used for uniqueness checks. Defaults to the target's owner document. */
  scope?: ParentNode;
  /**
   * Optional logger. When provided, the orchestrator emits a `debug` log if a
   * strategy produces a malformed selector that throws during the uniqueness
   * check — useful for diagnosing strategy bugs without crashing the engine.
   */
  logger?: ElementSelectorLogger;
}

/**
 * Try to produce a CSS selector for `el` using the strategy chain.
 *
 * Returns the composed selector string on success, or `null` if every strategy
 * declined at every walked ancestor. Callers (the engine) treat `null` as the
 * signal to invoke the fallback walker.
 *
 * Selector format on success:
 *
 *   - Anchor only (target itself was an anchor):  `<anchor-selector>`
 *   - Anchor + trail (anchor was an ancestor):    `<anchor-selector> > <descent>`
 *
 * Where `<anchor-selector>` is whatever the winning strategy returned for the
 * anchor element (e.g. `[data-amp-track-id="login-form"]` or `div#hero`), and
 * `<descent>` is `describeRelative(anchor, trail)`.
 */
export function runOrchestrator(
  el: Element,
  config: ResolvedSelectorConfig,
  options: OrchestratorOptions = {},
): string | null {
  const strategies = options.strategies ?? DEFAULT_STRATEGIES;
  const scope: ParentNode = options.scope ?? el.ownerDocument ?? document;
  const ctx: StrategyContext = { scope, config };

  const walk = collectWalk(el, config.maxAncestorWalkDepth);

  // Two-pass: try strategy[0] across the whole walk, then strategy[1], etc.
  // This gives an "explicit anchor at any depth beats a structural anchor any
  // depth" priority, which matches the design doc's "customer intent overrides
  // structural inference" rule.
  for (const strategy of strategies) {
    for (let i = 0; i < walk.length; i++) {
      const anchor = walk[i];
      const anchorSelector = strategy.try(anchor, ctx);
      if (anchorSelector === null) continue;

      // Anchor was the target itself — no descent needed.
      if (i === 0) {
        if (isUniqueMatch(scope, anchorSelector, el, strategy.name, options.logger)) {
          return anchorSelector;
        }
        continue;
      }

      // Anchor was an ancestor — descend back to the target through the trail.
      const trail = walk.slice(0, i).reverse();
      const descent = describeRelative(anchor, trail);
      const composed = `${anchorSelector} > ${descent}`;
      if (isUniqueMatch(scope, composed, el, strategy.name, options.logger)) {
        return composed;
      }
    }
  }

  return null;
}

/**
 * Build the walk array `[target, parent, grandparent, ...]`, stopping at
 * `<html>` (or at the depth limit if configured). Excludes the document
 * element's parent (which is the Document node and not an Element).
 */
function collectWalk(el: Element, maxDepth: number | undefined): Element[] {
  const walk: Element[] = [];
  let cursor: Element | null = el;
  while (cursor !== null) {
    walk.push(cursor);
    if (maxDepth !== undefined && walk.length > maxDepth) break;
    cursor = cursor.parentElement;
  }
  return walk;
}

/**
 * Check whether `selector` resolves to exactly `el` and no other element in
 * `scope`. The strategies themselves don't run uniqueness checks — that's the
 * orchestrator's job, so strategies stay pure transforms and stay testable in
 * isolation.
 *
 * When the selector is malformed (which is a strategy bug rather than user
 * input), we log at `debug` and return false rather than throwing. The log
 * lets engineers diagnose a misbehaving strategy without the engine taking
 * down whatever it's wired into.
 */
function isUniqueMatch(
  scope: ParentNode,
  selector: string,
  el: Element,
  strategyName: string,
  logger?: ElementSelectorLogger,
): boolean {
  let matches: NodeListOf<Element>;
  try {
    matches = scope.querySelectorAll(selector);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger?.debug(
      `@amplitude/element-selector: strategy "${strategyName}" emitted a malformed selector "${selector}" (${message})`,
    );
    return false;
  }
  return matches.length === 1 && matches[0] === el;
}
