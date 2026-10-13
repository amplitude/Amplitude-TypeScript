import { AuditItem, ItemContext, makeId } from '../shared/item';

const SELECTOR_KEYS = ['[Amplitude] Element Selector', 'selector'];
const TEXT_KEYS = ['[Amplitude] Element Text', 'text'];

export function stringValuesFromEvent(ev: any): { value: string; selector: string; context: ItemContext }[] {
  const props = { ...(ev?.event_properties ?? {}), ...(ev?.user_properties ?? {}) };
  const selector = SELECTOR_KEYS.map((k) => props[k]).find(Boolean) ?? '';
  const out: { value: string; selector: string; context: ItemContext }[] = [];
  for (const [key, val] of Object.entries(props)) {
    if (typeof val !== 'string' || !val.trim()) continue;
    if (SELECTOR_KEYS.includes(key)) continue;
    const context: ItemContext = { label: key, selectorPath: selector || undefined };
    out.push({ value: val, selector: selector || key, context });
  }
  return out;
}

export function eventsToItems(events: any[]): AuditItem[] {
  const out: AuditItem[] = [];
  for (const ev of events) {
    const isAuto = typeof ev?.event_type === 'string' && ev.event_type.startsWith('[Amplitude]');
    const source = isAuto ? 'autocapture' : 'network';
    for (const { value, selector, context } of stringValuesFromEvent(ev)) {
      out.push({
        id: makeId([source, selector, value]),
        source,
        value,
        selector,
        context,
      });
    }
  }
  return out;
}
