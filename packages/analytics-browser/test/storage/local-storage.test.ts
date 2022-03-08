import { LocalStorage } from '../../src/storage/local-storage';

describe('local-storage', () => {
  describe('isEnabled', () => {
    test('should return false', () => {
      const localStorage = new LocalStorage();
      jest.spyOn(localStorage, 'set').mockImplementationOnce(() => {
        throw new Error();
      });
      expect(localStorage.isEnabled()).toBe(false);
    });

    test('should return true', () => {
      const localStorage = new LocalStorage();
      expect(localStorage.isEnabled()).toBe(true);
    });
  });

  describe('get', () => {
    test('should return null if not set', () => {
      const localStorage = new LocalStorage();
      expect(localStorage.get('1')).toBe(null);
    });

    test('should return value', () => {
      const localStorage = new LocalStorage();
      localStorage.set('1', 'a');
      expect(localStorage.get('1')).toBe('a');
    });
  });

  describe('set', () => {
    test('should set value', () => {
      const localStorage = new LocalStorage();
      localStorage.set('1', 'a');
      expect(localStorage.get('1')).toBe('a');
    });
  });

  describe('remove', () => {
    test('should remove value of key', () => {
      const localStorage = new LocalStorage();
      localStorage.set('1', 'a');
      localStorage.set('2', 'b');
      expect(localStorage.get('1')).toBe('a');
      expect(localStorage.get('2')).toBe('b');
      localStorage.remove('1');
      expect(localStorage.get('1')).toBe(null);
      expect(localStorage.get('2')).toBe('b');
    });
  });

  describe('reset', () => {
    test('should remove all values', () => {
      const localStorage = new LocalStorage();
      localStorage.set('1', 'a');
      localStorage.set('2', 'b');
      expect(localStorage.get('1')).toBe('a');
      expect(localStorage.get('2')).toBe('b');
      localStorage.reset();
      expect(localStorage.get('1')).toBe(null);
      expect(localStorage.get('2')).toBe(null);
    });
  });
});
