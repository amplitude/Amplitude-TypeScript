/**
 * Positional descent builder.
 *
 * Given an anchor element (the result of pass 2's walk in the orchestration PR)
 * and the trail of intermediate elements between the anchor and the original
 * click target, produce the CSS-selector descent string. Each step in the
 * descent uses `tag:nth-of-type(n)` so the resulting selector resolves
 * unambiguously to the original target regardless of class-state churn.
 *
 * Matches ContentSquare's "position within identical markers" convention.
 *
 * Example:
 *
 *   describeRelative(anchor, [<section>, <ul>, <li>])
 *     → "section:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3)"
 *
 * Combined with the anchor selector (`anchor#some-id`) by the orchestrator:
 *
 *   "anchor#some-id > section:nth-of-type(1) > ul:nth-of-type(1) > li:nth-of-type(3)"
 *
 * The `anchor` parameter is accepted for symmetry with the orchestrator's call
 * site but isn't currently used — the function only needs each trail element's
 * own parent context. We keep the signature so subsequent work can reference
 * the anchor when extending the descent format (e.g., to optimize bare
 * `:nth-of-type(1)` away when there's only one of that type).
 */
export function describeRelative(_anchor: Element, trail: Element[]): string {
  return trail.map(stepFor).join(' > ');
}

function stepFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (parent === null) {
    // Detached element or root — emit just the tag. The orchestrator shouldn't
    // call us with a detached trail, but we don't want to crash if it does.
    return tag;
  }
  const index = sameTypeIndex(el, parent);
  return `${tag}:nth-of-type(${index})`;
}

function sameTypeIndex(el: Element, parent: Element): number {
  // 1-based index among same-tag element siblings, mirroring :nth-of-type semantics.
  let count = 0;
  for (let i = 0; i < parent.children.length; i++) {
    const sibling = parent.children[i];
    if (sibling.tagName === el.tagName) {
      count += 1;
      if (sibling === el) return count;
    }
  }
  // Element wasn't found among its parent's children — shouldn't happen for a
  // live element. Return 1 as a defensive fallback rather than throwing.
  return 1;
}
