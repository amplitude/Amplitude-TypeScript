import { Memory } from '../../src/storage/memory';

describe('memory', () => {
  describe('isEnabled', () => {
    test('should return true', () => {
      const memoryStorage = new Memory();
      expect(memoryStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return null if not set', () => {
      const memoryStorage = new Memory();
      expect(memoryStorage.get('1')).toBe(null);
    });

    test('should return value', () => {
      const memoryStorage = new Memory();
      memoryStorage.set('1', 'a');
      expect(memoryStorage.get('1')).toBe('a');
    });
  });

  describe('set', () => {
    test('should set value', () => {
      const memoryStorage = new Memory();
      memoryStorage.set('1', 'a');
      expect(memoryStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', () => {
      const memoryStorage = new Memory();
      memoryStorage.set('1', 'a');
      memoryStorage.set('2', 'b');
      expect(memoryStorage.get('1')).toBe('a');
      expect(memoryStorage.get('2')).toBe('b');
      memoryStorage.remove('1');
      expect(memoryStorage.get('1')).toBe(null);
      expect(memoryStorage.get('2')).toBe('b');
    });
  });

  describe('reset', () => {
    test('should remove all values', () => {
      const memoryStorage = new Memory();
      memoryStorage.set('1', 'a');
      memoryStorage.set('2', 'b');
      expect(memoryStorage.get('1')).toBe('a');
      expect(memoryStorage.get('2')).toBe('b');
      memoryStorage.reset();
      expect(memoryStorage.get('1')).toBe(null);
      expect(memoryStorage.get('2')).toBe(null);
    });
  });
});
