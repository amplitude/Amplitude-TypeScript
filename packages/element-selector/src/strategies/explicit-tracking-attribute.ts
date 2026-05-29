import { Strategy } from '../types';

/**
 * First strategy in the chain. Customer-controlled anchor selector via the
 * configured tracking attribute (default: `data-amp-track-id`).
 *
 * Semantics:
 *
 *   - Attribute set with a non-empty value:
 *       returns `[<attr>="<value>"]` — uses this element as an explicit anchor.
 *   - Attribute set with an empty value:
 *       returns null. The empty value is a suppression signal for downstream
 *       components (the `stableId` strategy and the fallback both consult
 *       `getStableId` which honors the empty-value semantic). This strategy
 *       doesn't anchor on the element either.
 *   - Attribute absent:
 *       returns null.
 *
 * The selector wraps the value in JSON-encoded quotes so any special CSS
 * characters in the value are escaped uniformly.
 */
export const explicitTrackingAttribute: Strategy = {
  name: 'explicitTrackingAttribute',

  try(el, ctx) {
    const attrName = ctx.config.explicitTrackingAttribute;
    const value = el.getAttribute(attrName);
    if (value === null || value === '') {
      return null;
    }
    // JSON.stringify wraps in double quotes and escapes embedded quotes /
    // backslashes — the resulting attribute selector is valid CSS.
    return `[${attrName}=${JSON.stringify(value)}]`;
  },
};
