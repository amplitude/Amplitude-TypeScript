import { escapeCssIdentifier } from './escape-css-identifier';

/** Escape an element id for the `tag#<id>` selector form shared by strategies and fallback. */
export function escapeIdForCss(id: string): string {
  return escapeCssIdentifier(id);
}
