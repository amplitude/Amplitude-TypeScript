/**
 * Shadow-DOM traversal + re-resolution helpers.
 *
 * CSS selectors cannot pierce shadow boundaries: `document.querySelector` never
 * matches an element that lives inside a shadow root. So a selector that needs
 * to reach into shadow DOM can't be a single flat string — it has to be a
 * sequence of per-tree selectors, one per shadow tree, each resolvable within
 * its own root. We join those segments with `SHADOW_BOUNDARY_DELIMITER` and
 * re-resolve them with `resolveSelector`, descending one `shadowRoot` per
 * boundary.
 *
 * This module owns the primitives that knowledge lives in:
 *
 *   - `composedParent` / `rootOf` — walk *out* of a shadow tree (the light-DOM
 *     `parentElement` chain dead-ends at a shadow root; `getRootNode().host`
 *     crosses the boundary).
 *   - `segmentWalk` — split the outward walk into per-tree segments, honoring
 *     the configured max shadow depth.
 *   - `resolveSelector` — the symmetric inverse of the engine's output: split
 *     on the delimiter and pierce open shadow roots to re-find the element.
 *   - `positionalStep` — a shadow-aware `tag:nth-of-type(n)` builder shared by
 *     the orchestrator's descent and the fallback walker, so a shadow-root-top
 *     element is still disambiguated against its `ShadowRoot` siblings.
 *
 * See the design doc:
 *   packages/plugin-autocapture-browser/element-selector-strategy-v1-no-classes.md
 */

/**
 * Delimiter that separates per-shadow-tree segments in a generated selector.
 *
 * Chosen to be visually distinct and trivially splittable, and to be invalid as
 * a real CSS combinator so it can never be confused with a `>` child combinator
 * the engine emits inside a single tree. Example output:
 *
 *   `div#host >>> button:nth-of-type(1)`
 *
 * which `resolveSelector` re-resolves as
 *   `document.querySelector('div#host').shadowRoot.querySelector('button:nth-of-type(1)')`.
 */
export const SHADOW_BOUNDARY_DELIMITER = ' >>> ';

/**
 * Marker prefix for a "direct child from the root" chain inside a shadow tree.
 *
 * A positional chain scoped to a `ShadowRoot` (e.g. `div:nth-of-type(2)`) is not
 * anchored: `querySelector` matches it tree-wide, and `:scope` matches nothing
 * on a `ShadowRoot` (it isn't an element), so there is no CSS way to express
 * "direct child of the root." The generator therefore prefixes such chains with
 * this marker and `resolveSelector` resolves them by strict direct-child descent
 * instead of `querySelector`. Keying off this explicit marker — rather than
 * sniffing a segment for the absence of `#`/`[` — keeps the round-trip correct
 * no matter what the steps contain (tag, `:nth-of-type`, classes, …).
 *
 * `:scope > ` is deliberately valid CSS syntax so a generated selector stays a
 * syntactically legal string; its meaning here is purely the descent signal.
 */
export const SHADOW_CHILD_CHAIN_PREFIX = ':scope > ';

/** Narrowing guard that tolerates environments without a `ShadowRoot` global. */
function isShadowRoot(node: Node): node is ShadowRoot {
  return typeof ShadowRoot !== 'undefined' && node instanceof ShadowRoot;
}

/**
 * The queryable root for `el`'s own tree: the enclosing `ShadowRoot` when `el`
 * lives inside shadow DOM, otherwise the owner document. Both support
 * `querySelectorAll`, so uniqueness checks can be scoped to the correct tree.
 *
 * Preserves the legacy default for non-shadow elements (`ownerDocument`), so
 * nothing changes for the common flat-document case.
 */
export function rootOf(el: Element): ParentNode {
  const root = el.getRootNode();
  if (isShadowRoot(root)) {
    return root;
  }
  return el.ownerDocument ?? document;
}

/**
 * The next element up, crossing shadow boundaries: `parentElement` within a
 * tree, or the shadow host when `el` is at the top of a shadow tree. Returns
 * `null` only at the document root (or a detached non-shadow root).
 */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) {
    return el.parentElement;
  }
  const root = el.getRootNode();
  if (isShadowRoot(root)) {
    return root.host;
  }
  return null;
}

/** One tree's contribution to a piercing selector. */
export interface TreeSegment {
  /** Queryable root for this tree — a `Document` or `ShadowRoot`. */
  root: ParentNode;
  /** Element to locate within `root`: the host of the next inner tree, or the original target. */
  target: Element;
}

export interface SegmentWalkResult {
  /** Tree segments, outermost (document) first — the order they're joined for output. */
  segments: TreeSegment[];
  /**
   * True when the target sat deeper than `maxShadowDepth` allowed, so inner
   * trees were dropped and the innermost emitted segment targets the shadow
   * host at the depth limit rather than the original target.
   */
  truncated: boolean;
}

// Defensive bound against a pathological / cyclic host chain. Far above any
// real shadow nesting (the resolver caps effective depth at MAX_SHADOW_DOM_DEPTH).
const MAX_WALK_ITERATIONS = 1024;

/**
 * Split the outward composed walk from `el` into per-tree segments.
 *
 * Always walks fully out to the document so the outermost segment is
 * document-rooted and therefore re-resolvable. `maxShadowDepth` caps how many
 * shadow boundaries the *emitted* selector descends through: when the target is
 * nested deeper than the budget, the innermost (over-budget) trees are dropped
 * and the result is flagged `truncated` — the innermost kept segment then
 * targets the shadow host at the depth limit (a best-effort, still-resolvable
 * selector for an ancestor of the true target).
 */
export function segmentWalk(el: Element, maxShadowDepth: number): SegmentWalkResult {
  // Build innermost-first: one segment per tree, each `target` being the
  // element to locate within that tree (the inner tree's host, or `el`).
  const innermostFirst: TreeSegment[] = [];
  let node: Element | null = el;
  let iterations = 0;

  while (node !== null && iterations < MAX_WALK_ITERATIONS) {
    iterations += 1;
    const root = rootOf(node);
    innermostFirst.push({ root, target: node });
    const actualRoot = node.getRootNode();
    if (!isShadowRoot(actualRoot)) {
      break; // reached the document (or a detached non-shadow root)
    }
    node = actualRoot.host; // cross the boundary outward
  }

  const totalCrossings = innermostFirst.length - 1;
  let truncated = false;
  let kept = innermostFirst;

  if (totalCrossings > maxShadowDepth) {
    // Drop the innermost over-budget trees, keeping the outermost
    // (maxShadowDepth + 1) trees. The new innermost kept segment's `target` is
    // already the shadow host of the first dropped tree.
    kept = innermostFirst.slice(totalCrossings - maxShadowDepth);
    truncated = true;
  }

  // Reverse to outermost-first so the engine joins document → target order.
  return { segments: kept.reverse(), truncated };
}

/**
 * Re-resolve a generated selector back to its element, piercing open shadow
 * roots at each boundary. The symmetric inverse of `engine.generate`.
 *
 * Returns `null` when any segment fails to match, or when a boundary crossing
 * hits a *closed* shadow root (`host.shadowRoot === null`) — closed roots are
 * opaque from outside, so such selectors cannot round-trip (a documented
 * limitation). Never throws on a malformed segment.
 *
 * @param root      Root to resolve against — almost always `document`.
 * @param selector  A selector produced by the engine (may contain boundary delimiters).
 */
export function resolveSelector(root: ParentNode, selector: string): Element | null {
  const segments = selector.split(SHADOW_BOUNDARY_DELIMITER);
  let scope: ParentNode | null = root;
  let found: Element | null = null;

  for (let i = 0; i < segments.length; i++) {
    if (scope === null) {
      return null; // previous segment's host had no (open) shadow root
    }
    const segment = segments[i].trim();
    try {
      found = resolveSegment(scope, segment);
    } catch {
      return null; // malformed segment — never throw out of the resolver
    }
    if (found === null) {
      return null;
    }
    if (i < segments.length - 1) {
      // Descend into this host's shadow root for the next segment. `null` for a
      // closed root ends resolution gracefully on the next iteration.
      scope = found.shadowRoot;
    }
  }

  return found;
}

/**
 * Resolve a single (non-delimited) segment within `scope`.
 *
 * A segment marked with {@link SHADOW_CHILD_CHAIN_PREFIX} is a root-anchored
 * "direct child from the root" chain (emitted by the fallback for a shadow-root
 * scope, where `querySelector` can't express that anchoring). We strip the
 * marker and resolve by strict direct-child descent. The marker is set
 * explicitly by the generator, so this stays correct regardless of what the
 * steps contain (tag, `:nth-of-type`, classes, …). Every other segment —
 * id/attribute-anchored, or any document-scope segment — is a normal
 * `querySelector`, byte-identical to before.
 */
function resolveSegment(scope: ParentNode, segment: string): Element | null {
  if (segment.startsWith(SHADOW_CHILD_CHAIN_PREFIX)) {
    return resolveChildChain(scope, segment.slice(SHADOW_CHILD_CHAIN_PREFIX.length));
  }
  return scope.querySelector(segment);
}

/**
 * Resolve a `>`-joined chain as a strict direct-child descent from `scope`. At
 * each level exactly one child matches the step (positional or otherwise via
 * `matches()`), so the walk is deterministic. Returns `null` if any step matches
 * no child.
 */
function resolveChildChain(scope: ParentNode, chain: string): Element | null {
  const steps = chain.split('>').map((s) => s.trim());
  let children: Element[] = Array.from(scope.children);
  let el: Element | null = null;
  for (const step of steps) {
    el = children.find((child) => child.matches(step)) ?? null;
    if (el === null) {
      return null;
    }
    children = Array.from(el.children);
  }
  return el;
}

/**
 * Build a single positional step for `el`: `tag:nth-of-type(n)`.
 *
 * Shadow-aware: when `el` is at the top of a shadow tree (`parentElement` is
 * null but its root is a `ShadowRoot`), the index is counted against the
 * `ShadowRoot`'s children so same-tag top-level siblings stay disambiguated.
 * For a genuine document root (`<html>`) or a detached element, emits the bare
 * tag — matching the prior behavior of the per-walker `stepFor` helpers.
 */
export function positionalStep(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (parent !== null) {
    return `${tag}:nth-of-type(${sameTypeIndexAmong(el, parent.children)})`;
  }
  const root = el.getRootNode();
  if (isShadowRoot(root)) {
    return `${tag}:nth-of-type(${sameTypeIndexAmong(el, root.children)})`;
  }
  return tag;
}

/** 1-based index of `el` among same-tag siblings in `siblings`, mirroring `:nth-of-type`. */
function sameTypeIndexAmong(el: Element, siblings: HTMLCollection): number {
  let count = 0;
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling.tagName === el.tagName) {
      count += 1;
      if (sibling === el) {
        return count;
      }
    }
  }
  // Defensive: element not found among its parent's children (shouldn't happen
  // for a live element). Return 1 rather than throwing.
  return 1;
}
