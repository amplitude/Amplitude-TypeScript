import { describe, it, expect } from 'vitest';
import { makeId } from '../src/shared/item';

describe('makeId', () => {
  it('is stable for the same parts', () => {
    expect(makeId(['dom', '#a', 'M. Chen'])).toBe(makeId(['dom', '#a', 'M. Chen']));
  });
  it('differs for different parts', () => {
    expect(makeId(['dom', '#a', 'x'])).not.toBe(makeId(['dom', '#a', 'y']));
  });
});
