/**
 * CSS identifier escape helper.
 *
 * The browser-native `CSS.escape` function is the right tool for escaping an
 * id (or class) for use in a CSS selector — it handles every special character
 * uniformly per the CSSOM spec. But it isn't defined in all execution
 * environments the package needs to support:
 *
 *   - jsdom (used by Jest) historically omitted it from the global namespace.
 *   - Older embedded browser engines (Electron < 7, some older WebViews) only
 *     ship `CSS.escape` polyfilled inconsistently.
 *
 * This helper uses `CSS.escape` when available and otherwise falls back to a
 * conservative manual escape — every byte that isn't a safe identifier char
 * (`[A-Za-z0-9_-]`) is replaced with `\<hex> ` per CSS spec section 4.1.3.
 *
 * Shared by:
 *   - the `stableId` strategy (anchor format `tag#<escaped-id>`)
 *   - `fallback-css-path` (anchor termination at a found stable id)
 *
 * Keeping both call sites on one helper means they're guaranteed to produce
 * byte-identical anchors for the same input — no chance of the strategy
 * emitting one form and the fallback emitting another.
 */

const SAFE_ID_CHAR = /[A-Za-z0-9_-]/;

export function escapeIdForCss(id: string): string {
  // Prefer the native CSSOM implementation when it's present. `typeof CSS`
  // is the standard runtime guard — `CSS` is a browser global declared in
  // lib.dom; we avoid touching `globalThis` directly so the no-restricted-
  // globals lint rule stays happy.
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return manualEscape(id);
}

function manualEscape(id: string): string {
  let out = '';
  for (let i = 0; i < id.length; i++) {
    const ch = id[i];
    if (SAFE_ID_CHAR.test(ch)) {
      out += ch;
      continue;
    }
    // Per CSS 4.1.3: replace with `\<hex>` followed by a space if the next
    // character could be interpreted as part of the hex escape.
    const code = id.charCodeAt(i).toString(16);
    out += '\\' + code + ' ';
  }
  // Trim a trailing escape-space — it's harmless but ugly in tests.
  return out.endsWith(' ') ? out.slice(0, -1) : out;
}
