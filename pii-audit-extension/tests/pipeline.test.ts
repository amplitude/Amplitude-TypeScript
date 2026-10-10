import { describe, it, expect } from 'vitest';
import { classifyItems } from '../src/detect/pipeline';
import type { AuditItem } from '../src/shared/item';
import type { ClassifierBackend } from '../src/detect/classifier';

const mock: ClassifierBackend = {
  async classify(c) {
    return Object.fromEntries(
      c.map((x) => [x.id, { category: 'person name', reason: 'model', tier: 'worth-a-look' as const }]),
    );
  },
};
const item = (id: string, value: string, selector: string): AuditItem => ({
  id,
  source: 'dom',
  value,
  selector,
  context: {},
});

describe('classifyItems', () => {
  it('flags a deterministic email without calling the model', async () => {
    const out = await classifyItems([item('1', 'm.chen@example.com', '#e')], {
      classify: async () => {
        throw new Error('should not be called');
      },
    });
    expect(out[0].pii?.category).toBe('email');
  });
  it('sends ambiguous free-text to the model', async () => {
    const out = await classifyItems([item('2', 'Margaret Chen', '#n')], mock);
    expect(out[0].pii?.category).toBe('person name');
  });
  it('dedupes by selector', async () => {
    const out = await classifyItems(
      [item('a', 'Margaret Ann Chen', '#dup'), item('b', 'Margaret Ann Chen', '#dup')],
      mock,
    );
    expect(out.filter((i) => i.pii).length).toBe(1);
  });
  it('drops noise before the model', async () => {
    const out = await classifyItems([item('3', '$1,299.00', '#p')], {
      classify: async () => {
        throw new Error('should not be called');
      },
    });
    expect(out[0].pii).toBeUndefined();
  });
});
