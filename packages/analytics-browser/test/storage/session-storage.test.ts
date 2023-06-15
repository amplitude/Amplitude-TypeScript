import { SessionStorage } from '../../src/storage/session-storage';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';

describe('local-storage', () => {
  describe('isEnabled', () => {
    test('should return true', async () => {
      const sessionStorage = new SessionStorage();
      expect(await sessionStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return undefined if not set', async () => {
      const sessionStorage = new SessionStorage();
      expect(await sessionStorage.get('1')).toBe(undefined);
    });

    test('should return object', async () => {
      const sessionStorage = new SessionStorage<Record<string, number>>();
      await sessionStorage.set('1', { a: 1 });
      expect(await sessionStorage.get('1')).toEqual({ a: 1 });
    });

    test('should return array', async () => {
      const sessionStorage = new SessionStorage<number[]>();
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual([1]);
    });
  });

  describe('set', () => {
    test('should set value', async () => {
      const sessionStorage = new SessionStorage();
      await sessionStorage.set('1', 'a');
      expect(await sessionStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', async () => {
      const sessionStorage = new SessionStorage();
      await sessionStorage.set('1', 'a');
      await sessionStorage.set('2', 'b');
      expect(await sessionStorage.get('1')).toBe('a');
      expect(await sessionStorage.get('2')).toBe('b');
      await sessionStorage.remove('1');
      expect(await sessionStorage.get('1')).toBe(undefined);
      expect(await sessionStorage.get('2')).toBe('b');
    });

    test('should handle when GlobalScope is not defined', async () => {
      const sessionStorage = new SessionStorage<number[]>();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual(undefined);
      await sessionStorage.remove('1');
    });
  });

  describe('reset', () => {
    test('should remove all values', async () => {
      const sessionStorage = new SessionStorage();
      await sessionStorage.set('1', 'a');
      await sessionStorage.set('2', 'b');
      expect(await sessionStorage.get('1')).toBe('a');
      expect(await sessionStorage.get('2')).toBe('b');
      await sessionStorage.reset();
      expect(await sessionStorage.get('1')).toBe(undefined);
      expect(await sessionStorage.get('2')).toBe(undefined);
    });

    test('should handle when GlobalScope is not defined', async () => {
      const sessionStorage = new SessionStorage<number[]>();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual(undefined);
      await sessionStorage.reset();
    });
  });
});
