import { LocalStorage } from '../../src/storage/local-storage';

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
  });

  describe('without AsyncStorage installed', () => {
    test('should degrade to a no-op when the package cannot be resolved', async () => {
      jest.resetModules();
      const factory = jest.fn(() => {
        throw new Error('Module not found');
      });
      jest.doMock('@react-native-async-storage/async-storage', factory);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
        const { LocalStorage: LocalStorageNoAS } = require('../../src/storage/local-storage') as {
          LocalStorage: typeof LocalStorage;
        };
        const storage = new LocalStorageNoAS<string>();
        expect(await storage.isEnabled()).toBe(false);
        expect(await storage.get('k')).toBe(undefined);
        expect(await storage.getRaw('k')).toBe(undefined);
        await storage.set('k', 'v');
        await storage.remove('k');
        await storage.reset();
        // The factory is invoked exactly once: on the first `getAsyncStorage()`
        // call. Each subsequent storage method must short-circuit on the cached
        // `undefined` value — otherwise we'd see additional `require()` attempts
        // (or, worse, crashes from calling methods on undefined).
        expect(factory).toHaveBeenCalledTimes(1);
      } finally {
        jest.dontMock('@react-native-async-storage/async-storage');
        jest.resetModules();
      }
    });
  });
});
