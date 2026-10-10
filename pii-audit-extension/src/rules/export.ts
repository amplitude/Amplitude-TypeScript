import { MaskingRule, rulesJson } from './generate';

export function downloadRules(rules: MaskingRule[]) {
  const blob = new Blob([rulesJson(rules)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pii-audit-masking-rules.json';
  a.click();
  URL.revokeObjectURL(url);
}
