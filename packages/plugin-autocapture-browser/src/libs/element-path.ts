/* istanbul ignore file -- This file is a deprecated thin re-export with no
   runtime behavior of its own. The `legacyCssPath` algorithm is covered
   exhaustively by `@amplitude/element-selector`'s own suite; re-running
   coverage against the re-export adds nothing. */

/**
 * Backward-compat re-export.
 *
 * The Chromium-DevTools-derived `cssPath` walker that lived here for years
 * has moved to `@amplitude/element-selector` as `legacyCssPath`. That's now
 * the canonical home — the SDK and the dashboard both import from there,
 * so the two can never drift again.
 *
 * This file stays around as a thin re-export so:
 *
 *  - any third-party consumer that historically deep-imported `cssPath` from
 *    `@amplitude/plugin-autocapture-browser/src/libs/element-path` continues
 *    to work without code changes;
 *  - the autocapture plugin's own internals don't have to special-case the
 *    rename mid-PR (although `data-extractor` no longer uses it — all
 *    routing happens via `generateSelector` from the package).
 *
 * Slated for deletion in a future major once we've audited and confirmed no
 * external imports remain.
 *
 * @deprecated Import `legacyCssPath` from `@amplitude/element-selector` directly.
 */

export { legacyCssPath as cssPath } from '@amplitude/element-selector';
