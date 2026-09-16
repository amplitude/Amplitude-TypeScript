import { AuditItem } from '../shared/item';
import { detectStructured, isNoise } from './deterministic';
import { contextString, ClassifierBackend } from './classifier';

export async function classifyItems(items: AuditItem[], backend: ClassifierBackend): Promise<AuditItem[]> {
  const bySelector = new Map<string, AuditItem>();
  for (const it of items) if (!bySelector.has(it.selector)) bySelector.set(it.selector, it);
  const unique = [...bySelector.values()];

  const toModel: { id: string; text: string }[] = [];
  for (const it of unique) {
    const det = detectStructured(it.value);
    if (det) {
      it.pii = { category: det.category, reason: `matches ${det.category} pattern`, tier: 'recommend' };
      continue;
    }
    if (isNoise(it.value)) continue;
    toModel.push({ id: it.id, text: contextString(it) });
  }
  if (toModel.length) {
    const verdicts = await backend.classify(toModel);
    for (const it of unique) {
      const v = verdicts[it.id];
      if (v) it.pii = v;
    }
  }
  return unique;
}
