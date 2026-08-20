import { describe, it, expect } from 'vitest';
import { detectStructured, isNoise, luhn } from '../src/detect/deterministic';

describe('detectStructured', () => {
  it('flags email', () => expect(detectStructured('m.chen@example.com')?.category).toBe('email'));
  it('flags a valid credit card via Luhn', () =>
    expect(detectStructured('4242 4242 4242 4242')?.category).toBe('credit-card'));
  it('does not flag an invalid card number', () => expect(detectStructured('1234 5678 9012 3456')).toBeNull());
  it('flags SSN', () => expect(detectStructured('123-45-6789')?.category).toBe('ssn'));
  it('flags IPv4', () => expect(detectStructured('192.168.0.1')?.category).toBe('ip'));
  it('returns null for a plain name', () => expect(detectStructured('M. Chen')).toBeNull());
});

describe('isNoise', () => {
  it('treats currency as noise', () => expect(isNoise('$1,299.00')).toBe(true));
  it('treats counts as noise', () => expect(isNoise('42')).toBe(true));
  it('treats short button labels as noise', () => expect(isNoise('Update plan')).toBe(true));
  it('keeps a full name', () => expect(isNoise('Margaret Chen')).toBe(false));
});

describe('luhn', () => {
  it('validates a known-good number', () => expect(luhn('4242424242424242')).toBe(true));
  it('rejects a bad number', () => expect(luhn('4242424242424241')).toBe(false));
});
