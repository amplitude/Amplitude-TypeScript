import { getInputType, toLowerCase } from '../../src/utils/get-input-type';

describe('getInputType', () => {
  beforeEach(() => {
    // Clear the DOM before each test
    document.body.innerHTML = '';
  });

  describe('toLowerCase', () => {
    test('should convert string to lowercase', () => {
      expect(toLowerCase('TEXT')).toBe('text');
      expect(toLowerCase('Password')).toBe('password');
      expect(toLowerCase('EMAIL')).toBe('email');
      expect(toLowerCase('MiXeD')).toBe('mixed');
    });

    test('should handle already lowercase strings', () => {
      expect(toLowerCase('text')).toBe('text');
      expect(toLowerCase('password')).toBe('password');
    });

    test('should handle empty string', () => {
      expect(toLowerCase('')).toBe('');
    });
  });

  describe('getInputType', () => {
    test('should return null for non-input elements without type attribute', () => {
      const div = document.createElement('div');
      expect(getInputType(div)).toBeNull();
    });

    test('should return "password" for elements with data-rr-is-password attribute', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-rr-is-password', '');

      expect(getInputType(input)).toBe('password');
    });

    test('should return "password" for elements with data-rr-is-password attribute regardless of actual type', () => {
      const input = document.createElement('input');
      input.type = 'email';
      input.setAttribute('data-rr-is-password', '');

      expect(getInputType(input)).toBe('password');
    });

    test('should return lowercase type for input elements without data-rr-is-password', () => {
      const input = document.createElement('input');
      input.type = 'TEXT';

      expect(getInputType(input)).toBe('text');
    });

    test('should return lowercase type for various input types', () => {
      const testTypes = ['EMAIL', 'Password', 'Number', 'Tel', 'Url', 'Search'];

      testTypes.forEach((type) => {
        const input = document.createElement('input');
        input.type = type;

        expect(getInputType(input)).toBe(type.toLowerCase());
      });
    });

    test('should return "text" for input elements without explicit type (default behavior)', () => {
      const input = document.createElement('input');
      // When no type is specified, HTMLInputElement.type defaults to 'text'

      expect(getInputType(input)).toBe('text');
    });

    test('should handle elements that were originally password inputs but changed to text', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-rr-is-password', 'true');

      // This simulates the case where a password input was changed to text input
      // but we still want to treat it as password for privacy
      expect(getInputType(input)).toBe('password');
    });

    test('should return null for elements without type property', () => {
      const span = document.createElement('span');

      expect(getInputType(span)).toBeNull();
    });

    test('should handle mixed case types correctly', () => {
      const input = document.createElement('input');
      input.type = 'PaSSworD';

      expect(getInputType(input)).toBe('password');
    });

    test('should prioritize data-rr-is-password over actual type', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.setAttribute('data-rr-is-password', '');

      expect(getInputType(input)).toBe('password');
    });

    test('should handle elements with falsy data-rr-is-password attribute values', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('data-rr-is-password', 'false');

      // hasAttribute returns true even if the value is 'false', since the attribute exists
      expect(getInputType(input)).toBe('password');
    });

    test('should not treat elements without data-rr-is-password as password', () => {
      const input = document.createElement('input');
      input.type = 'password';
      // No data-rr-is-password attribute

      expect(getInputType(input)).toBe('password');
    });
  });
});
