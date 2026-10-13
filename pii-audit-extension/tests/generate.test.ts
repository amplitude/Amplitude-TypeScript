import { describe, it, expect } from 'vitest';
import { ruleFor, rulesJson } from '../src/rules/generate';
import type { AuditItem } from '../src/shared/item';

const base = (over: Partial<AuditItem>): AuditItem => ({
  id: 'x',
  source: 'dom',
  value: 'v',
  selector: '#a',
  context: {},
  ...over,
});

describe('ruleFor', () => {
  it('uses element-mask with the selector for DOM findings', () => {
    const r = ruleFor(base({ selector: '#holder', pii: { category: 'person name', reason: '', tier: 'recommend' } }));
    expect(r).toEqual({
      kind: 'element-mask',
      target: '#holder',
      note: expect.stringContaining('person name'),
    });
  });
  it('uses regex for structured categories', () => {
    const r = ruleFor(base({ pii: { category: 'email', reason: '', tier: 'recommend' } }));
    expect(r.kind).toBe('regex');
  });
});

describe('rulesJson', () => {
  it('serializes stably', () => {
    expect(rulesJson([{ kind: 'regex', target: '\\S+@\\S+', note: 'email' }])).toContain('"kind": "regex"');
  });
});
