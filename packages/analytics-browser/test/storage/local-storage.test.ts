import { Logger } from '@amplitude/analytics-core';
import { LocalStorage } from '../../src/storage/local-storage';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';

describe('local-storage', () => {
  describe('isEnabled', () => {
    test('should return true', async () => {
      const localStorage = new LocalStorage();
      expect(await localStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return undefined if not set', async () => {
      const localStorage = new LocalStorage();
      expect(await localStorage.get('1')).toBe(undefined);
    });

    test('should return object', async () => {
      const localStorage = new LocalStorage<Record<string, number>>();
      await localStorage.set('1', { a: 1 });
      expect(await localStorage.get('1')).toEqual({ a: 1 });
    });

    test('should return array', async () => {
      const localStorage = new LocalStorage<number[]>();
      await localStorage.set('1', [1]);
      expect(await localStorage.get('1')).toEqual([1]);
    });
  });

  describe('set', () => {
    test('should set value', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      expect(await localStorage.get('1')).toBe('a');
    });

    test('should drop events when set more than 1000 events without logging', async () => {
      const localStorage = new LocalStorage<number[]>();

      await localStorage.set('storage-key', new Array<number>(1001).fill(1));
      const value = await localStorage.get('storage-key');

      expect(value?.length).toBe(1000);
    });

    test('should drop events when set more than 1000 events and use custom logger', async () => {
      const loggerProvider = new Logger();
      const localStorage = new LocalStorage<number[]>({ loggerProvider });
      const errorMock = jest.spyOn(loggerProvider, 'error');

      await localStorage.set('storage-key', new Array<number>(1001).fill(1));
      const value = await localStorage.get('storage-key');

      expect(value?.length).toBe(1000);
      expect(errorMock).toHaveBeenCalledTimes(1);
      expect(errorMock).toHaveBeenCalledWith('Failed to save 1 events because the queue length exceeded 1000.');
    });
  });

  describe('remove', () => {
    test('should remove value of key', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      await localStorage.set('2', 'b');
      expect(await localStorage.get('1')).toBe('a');
      expect(await localStorage.get('2')).toBe('b');
      await localStorage.remove('1');
      expect(await localStorage.get('1')).toBe(undefined);
      expect(await localStorage.get('2')).toBe('b');
    });

    test('should handle when GlobalScope is not defined', async () => {
      const localStorage = new LocalStorage<number[]>();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await localStorage.set('1', [1]);
      expect(await localStorage.get('1')).toEqual(undefined);
      await localStorage.remove('1');
    });
  });

  describe('reset', () => {
    test('should remove all values', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      await localStorage.set('2', 'b');
      expect(await localStorage.get('1')).toBe('a');
      expect(await localStorage.get('2')).toBe('b');
      await localStorage.reset();
      expect(await localStorage.get('1')).toBe(undefined);
      expect(await localStorage.get('2')).toBe(undefined);
    });

    test('should handle when GlobalScope is not defined', async () => {
      const localStorage = new LocalStorage<number[]>();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(undefined);
      await localStorage.set('1', [1]);
      expect(await localStorage.get('1')).toEqual(undefined);
      await localStorage.reset();
    });
  });
});
