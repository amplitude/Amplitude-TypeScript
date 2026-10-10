import { describe, it, expect } from 'vitest';
import { AUDIT_FLAG } from '../src/shared/messages';

describe('messages', () => {
  it('exposes the sessionStorage flag key', () => {
    expect(AUDIT_FLAG).toBe('__pii_audit_active__');
  });
});
