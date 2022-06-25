import { MemoryStorage } from '../../src/storage/memory';

describe('memory', () => {
  describe('isEnabled', () => {
    test('should return true', async () => {
      const memoryStorage = new MemoryStorage();
      expect(await memoryStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return null if not set', async () => {
      const memoryStorage = new MemoryStorage();
      expect(await memoryStorage.get('1')).toBe(undefined);
    });

    test('should return value', async () => {
      const memoryStorage = new MemoryStorage();
      await memoryStorage.set('1', 'a');
      expect(await memoryStorage.get('1')).toBe('a');
    });
  });

  describe('getRaw', () => {
    test('should return null if not set', async () => {
      const memoryStorage = new MemoryStorage();
      expect(await memoryStorage.getRaw('1')).toBe(undefined);
    });

    test('should return value', async () => {
      const memoryStorage = new MemoryStorage();
      await memoryStorage.set('1', 'a');
      expect(await memoryStorage.getRaw('1')).toBe('"a"');
    });
  });

  describe('set', () => {
    test('should set value', async () => {
      const memoryStorage = new MemoryStorage();
      await memoryStorage.set('1', 'a');
      expect(await memoryStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', async () => {
      const memoryStorage = new MemoryStorage();
      await memoryStorage.set('1', 'a');
      await memoryStorage.set('2', 'b');
      expect(await memoryStorage.get('1')).toBe('a');
      expect(await memoryStorage.get('2')).toBe('b');
      await memoryStorage.remove('1');
      expect(await memoryStorage.get('1')).toBe(undefined);
      expect(await memoryStorage.get('2')).toBe('b');
    });
  });

  describe('reset', () => {
    test('should remove all values', async () => {
      const memoryStorage = new MemoryStorage();
      await memoryStorage.set('1', 'a');
      await memoryStorage.set('2', 'b');
      expect(await memoryStorage.get('1')).toBe('a');
      expect(await memoryStorage.get('2')).toBe('b');
      await memoryStorage.reset();
      expect(await memoryStorage.get('1')).toBe(undefined);
      expect(await memoryStorage.get('2')).toBe(undefined);
    });
  });
});
