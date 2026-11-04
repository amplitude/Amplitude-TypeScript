import { AuditItem } from '../shared/item';

export interface MaskingRule {
  kind: 'element-mask' | 'attribute-mask' | 'regex' | 'url-exclude';
  target: string;
  note: string;
}

const REGEX_FOR: Record<string, string> = {
  email: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+',
  ssn: '\\d{3}-\\d{2}-\\d{4}',
  'credit-card': '\\d[\\d -]{11,22}\\d',
  ip: '(?:\\d{1,3}\\.){3}\\d{1,3}',
};

export function ruleFor(item: AuditItem): MaskingRule {
  const cat = item.pii?.category ?? 'unknown';
  const note = `Masks ${cat} found ${item.context.label ? `under "${item.context.label}"` : `at ${item.selector}`}`;
  if (REGEX_FOR[cat]) return { kind: 'regex', target: REGEX_FOR[cat], note };
  return { kind: 'element-mask', target: item.selector, note };
}

export function rulesJson(rules: MaskingRule[]): string {
  return JSON.stringify({ version: 1, rules }, null, 2);
}
