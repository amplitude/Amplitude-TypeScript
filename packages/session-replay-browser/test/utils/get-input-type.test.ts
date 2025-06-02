import { getInputType } from '../../src/utils/get-input-type';

describe('getInputType', () => {
  test('should return empty string for null element', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = getInputType(null as any);
    expect(result).toBe('');
  });

  test('should return empty string for undefined element', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = getInputType(undefined as any);
    expect(result).toBe('');
  });

  test('should return input type for input elements', () => {
    const inputElement = document.createElement('input');
    inputElement.type = 'password';

    const result = getInputType(inputElement);
    expect(result).toBe('password');
  });

  test('should return "text" as default for input elements without type', () => {
    const inputElement = document.createElement('input');
    // Don't set type, should default to 'text'

    const result = getInputType(inputElement);
    expect(result).toBe('text');
  });

  test('should handle various input types', () => {
    const testCases = [
      { type: 'email', expected: 'email' },
      { type: 'password', expected: 'password' },
      { type: 'hidden', expected: 'hidden' },
      { type: 'tel', expected: 'tel' },
      { type: 'search', expected: 'search' },
      { type: 'number', expected: 'number' },
    ];

    testCases.forEach(({ type, expected }) => {
      const inputElement = document.createElement('input');
      inputElement.type = type;

      const result = getInputType(inputElement);
      expect(result).toBe(expected);
    });
  });

  test('should return "textarea" for textarea elements', () => {
    const textareaElement = document.createElement('textarea');

    const result = getInputType(textareaElement);
    expect(result).toBe('textarea');
  });

  test('should return "select" for select elements', () => {
    const selectElement = document.createElement('select');

    const result = getInputType(selectElement);
    expect(result).toBe('select');
  });

  test('should return empty string for non-input elements', () => {
    const divElement = document.createElement('div');

    const result = getInputType(divElement);
    expect(result).toBe('');
  });

  test('should return empty string for span elements', () => {
    const spanElement = document.createElement('span');

    const result = getInputType(spanElement);
    expect(result).toBe('');
  });
});
