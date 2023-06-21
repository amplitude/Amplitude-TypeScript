import { BrowserStorage } from '../../src/storage/browser-storage';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { getGlobalScope } from '@amplitude/analytics-client-common';

describe('browser-storage', () => {
  describe('isEnabled', () => {
    test('should return true', async () => {
      const sessionStorage = new BrowserStorage(getGlobalScope()?.sessionStorage);
      expect(await sessionStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return undefined if not set', async () => {
      const sessionStorage = new BrowserStorage(getGlobalScope()?.sessionStorage);
      expect(await sessionStorage.get('1')).toBe(undefined);
    });

    test('should return undefined if invalid json is stored at key', async () => {
      const storage = getGlobalScope()?.sessionStorage;
      const sessionStorage = new BrowserStorage<number[]>(storage);
      storage?.setItem('1', 'not a json string');
      expect(await sessionStorage.get('1')).toEqual(undefined);
    });

    test('should return object', async () => {
      const sessionStorage = new BrowserStorage<Record<string, number>>(getGlobalScope()?.sessionStorage);
      await sessionStorage.set('1', { a: 1 });
      expect(await sessionStorage.get('1')).toEqual({ a: 1 });
    });

    test('should return array', async () => {
      const sessionStorage = new BrowserStorage<number[]>(getGlobalScope()?.sessionStorage);
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual([1]);
    });
  });

  describe('set', () => {
    test('should set value', async () => {
      const sessionStorage = new BrowserStorage(getGlobalScope()?.sessionStorage);
      await sessionStorage.set('1', 'a');
      expect(await sessionStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', async () => {
      const sessionStorage = new BrowserStorage(getGlobalScope()?.sessionStorage);
      await sessionStorage.set('1', 'a');
      await sessionStorage.set('2', 'b');
      expect(await sessionStorage.get('1')).toBe('a');
      expect(await sessionStorage.get('2')).toBe('b');
      await sessionStorage.remove('1');
      expect(await sessionStorage.get('1')).toBe(undefined);
      expect(await sessionStorage.get('2')).toBe('b');
    });

    test('should handle when GlobalScope is not defined', async () => {
      const sessionStorage = new BrowserStorage<number[]>(undefined);
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual(undefined);
      await sessionStorage.remove('1');
    });
  });

  describe('reset', () => {
    test('should remove all values', async () => {
      const sessionStorage = new BrowserStorage(getGlobalScope()?.sessionStorage);
      await sessionStorage.set('1', 'a');
      await sessionStorage.set('2', 'b');
      expect(await sessionStorage.get('1')).toBe('a');
      expect(await sessionStorage.get('2')).toBe('b');
      await sessionStorage.reset();
      expect(await sessionStorage.get('1')).toBe(undefined);
      expect(await sessionStorage.get('2')).toBe(undefined);
    });

    test('should handle when GlobalScope is not defined', async () => {
      const sessionStorage = new BrowserStorage<number[]>(undefined);
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await sessionStorage.set('1', [1]);
      expect(await sessionStorage.get('1')).toEqual(undefined);
      await sessionStorage.reset();
    });
  });
});
