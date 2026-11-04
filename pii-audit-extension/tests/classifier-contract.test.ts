import { describe, it, expect } from 'vitest';
import { contextString } from '../src/detect/classifier';
import type { AuditItem } from '../src/shared/item';

const item: AuditItem = {
  id: 'x',
  source: 'dom',
  value: 'M. Chen',
  selector: '#a',
  context: { label: 'Primary account holder', nearestHeading: 'Patient' },
};

describe('contextString', () => {
  it('injects label + heading around the value', () => {
    expect(contextString(item)).toBe("Field labeled 'Primary account holder' under heading 'Patient': M. Chen");
  });
});
