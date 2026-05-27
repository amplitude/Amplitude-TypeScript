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
    test('should degrade silently to a no-op when the package cannot be resolved', async () => {
      jest.resetModules();
      const factory = jest.fn(() => {
        const err = new Error(
          "Cannot find module '@react-native-async-storage/async-storage'",
        ) as NodeJS.ErrnoException;
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      });
      jest.doMock('@react-native-async-storage/async-storage', factory);
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
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
        // MODULE_NOT_FOUND is the supported opt-out path; we must not log.
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
        jest.resetModules();
      }
    });

    test('should warn but still degrade when the package throws a non-MODULE_NOT_FOUND error', async () => {
      jest.resetModules();
      jest.doMock('@react-native-async-storage/async-storage', () => {
        throw new Error('boom');
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
        const { LocalStorage: LocalStorageBroken } = require('../../src/storage/local-storage') as {
          LocalStorage: typeof LocalStorage;
        };
        const storage = new LocalStorageBroken<string>();
        expect(await storage.isEnabled()).toBe(false);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toContain('@react-native-async-storage/async-storage');
      } finally {
        warnSpy.mockRestore();
        jest.resetModules();
      }
    });

    test('should warn when MODULE_NOT_FOUND is about a transitive dependency, not our package', async () => {
      jest.resetModules();
      jest.doMock('@react-native-async-storage/async-storage', () => {
        const err = new Error("Cannot find module 'some-transitive-dep'") as NodeJS.ErrnoException;
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
        const { LocalStorage: LS } = require('../../src/storage/local-storage') as {
          LocalStorage: typeof LocalStorage;
        };
        const storage = new LS<string>();
        expect(await storage.isEnabled()).toBe(false);
        // A broken transitive install must NOT be silently swallowed: we want
        // the customer to see the error so they can fix their install.
        expect(warnSpy).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
        jest.resetModules();
      }
    });

    test('getRaw should swallow native bridge errors when the JS package is present', async () => {
      jest.resetModules();
      jest.doMock('@react-native-async-storage/async-storage', () => ({
        default: {
          getItem: jest.fn().mockRejectedValue(new Error('NativeModule: AsyncStorage is null')),
          setItem: jest.fn(),
          removeItem: jest.fn(),
          clear: jest.fn(),
        },
      }));
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-member-access
        const { LocalStorage: LS } = require('../../src/storage/local-storage') as {
          LocalStorage: typeof LocalStorage;
        };
        const storage = new LS<string>();
        expect(await storage.getRaw('k')).toBe(undefined);
      } finally {
        jest.resetModules();
      }
    });
  });
});
