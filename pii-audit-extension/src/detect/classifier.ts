import type { AuditItem, PiiFinding } from '../shared/item';

export interface ClassifierBackend {
  classify(candidates: { id: string; text: string }[]): Promise<Record<string, PiiFinding | null>>;
}

export function contextString(item: AuditItem): string {
  const label = item.context.label;
  const heading = item.context.nearestHeading;
  const prefix = [label ? `Field labeled '${label}'` : null, heading ? `under heading '${heading}'` : null]
    .filter(Boolean)
    .join(' ');
  return prefix ? `${prefix}: ${item.value}` : item.value;
}

export class WorkerClassifier implements ClassifierBackend {
  private worker = new Worker(new URL('./classifier.worker.ts', import.meta.url), { type: 'module' });
  private seq = 0;
  classify(candidates: { id: string; text: string }[]): Promise<Record<string, PiiFinding | null>> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      const onMsg = (e: MessageEvent) => {
        if (e.data?.id !== id) return;
        this.worker.removeEventListener('message', onMsg);
        resolve(e.data.result);
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ id, candidates });
    });
  }
}
