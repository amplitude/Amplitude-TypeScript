import { getMostRecentUserSession } from '../../src/utils/storage-helpers';
import { UserSession } from '@amplitude/analytics-core';

const session = (overrides: Partial<UserSession> = {}): UserSession => ({
  optOut: false,
  ...overrides,
});

describe('storage-helpers', () => {
  describe('getMostRecentUserSession', () => {
    test('returns undefined for empty array', async () => {
      expect(getMostRecentUserSession([])).toBeUndefined();
    });

    test('returns undefined for null or undefined input', async () => {
      expect(getMostRecentUserSession(null as unknown as UserSession[])).toBeUndefined();
      expect(getMostRecentUserSession(undefined as unknown as UserSession[])).toBeUndefined();
    });

    test('returns the only cookie when array has one item', async () => {
      const single = session({ userId: 'u1', lastWriteTime: 100 });
      expect(getMostRecentUserSession([single])).toBe(single);
    });

    test('returns cookie with greatest lastWriteTime', async () => {
      const older = session({ userId: 'u1', lastWriteTime: 100 });
      const newer = session({ userId: 'u2', lastWriteTime: 200 });
      const newest = session({ userId: 'u3', lastWriteTime: 300 });
      expect(getMostRecentUserSession([older, newer, newest])).toBe(newest);
      expect(getMostRecentUserSession([newest, older, newer])).toBe(newest);
    });

    test('falls back to lastEventTime when lastWriteTime is missing', async () => {
      const noWrite = session({ userId: 'u1', lastEventTime: 150 });
      const withWrite = session({ userId: 'u2', lastWriteTime: 100 });
      expect(getMostRecentUserSession([withWrite, noWrite])).toBe(noWrite);
    });

    test('treats missing lastWriteTime and lastEventTime as 0', async () => {
      const noTimes = session({ userId: 'u1' });
      const withTime = session({ userId: 'u2', lastWriteTime: 50 });
      expect(getMostRecentUserSession([noTimes, withTime])).toBe(withTime);
    });
  });
});
