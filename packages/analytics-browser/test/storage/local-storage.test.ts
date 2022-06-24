import { LocalStorage } from '../../src/storage/local-storage';

describe('local-storage', () => {
  describe('isEnabled', () => {
    test('should return true', () => {
      const localStorage = new LocalStorage();
      expect(localStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return undefined if not set', () => {
      const localStorage = new LocalStorage();
      expect(localStorage.get('1')).toBe(undefined);
    });

    test('should return object', async () => {
      const localStorage = new LocalStorage<Record<string, number>>();
      await localStorage.set('1', { a: 1 });
      expect(localStorage.get('1')).toEqual({ a: 1 });
    });

    test('should return array', async () => {
      const localStorage = new LocalStorage<number[]>();
      await localStorage.set('1', [1]);
      expect(localStorage.get('1')).toEqual([1]);
    });
  });

  describe('set', () => {
    test('should set value', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      expect(localStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      await localStorage.set('2', 'b');
      expect(localStorage.get('1')).toBe('a');
      expect(localStorage.get('2')).toBe('b');
      await localStorage.remove('1');
      expect(localStorage.get('1')).toBe(undefined);
      expect(localStorage.get('2')).toBe('b');
    });
  });

  describe('reset', () => {
    test('should remove all values', async () => {
      const localStorage = new LocalStorage();
      await localStorage.set('1', 'a');
      await localStorage.set('2', 'b');
      expect(localStorage.get('1')).toBe('a');
      expect(localStorage.get('2')).toBe('b');
      await localStorage.reset();
      expect(localStorage.get('1')).toBe(undefined);
      expect(localStorage.get('2')).toBe(undefined);
    });
  });
});
