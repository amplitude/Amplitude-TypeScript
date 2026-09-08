export interface ItemContext {
  label?: string;
  ariaLabel?: string;
  nearestHeading?: string;
  containerClass?: string;
  selectorPath?: string;
}
export interface PiiFinding {
  category: string;
  reason: string;
  tier: 'recommend' | 'worth-a-look';
}
export interface AuditItem {
  id: string;
  source: 'network' | 'autocapture' | 'dom';
  value: string;
  selector: string;
  rect?: DOMRectInit;
  context: ItemContext;
  pii?: PiiFinding;
}
export function makeId(parts: string[]): string {
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'it_' + (h >>> 0).toString(36);
}
