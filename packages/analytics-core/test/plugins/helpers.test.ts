/** @jest-environment jsdom */
import { MASKED_TEXT_VALUE, TEXT_MASK_ATTRIBUTE, getPageTitle } from '../../src/plugins/helpers';

describe('Constants', () => {
  describe('TEXT_MASK_ATTRIBUTE', () => {
    test('has the correct value', () => {
      expect(TEXT_MASK_ATTRIBUTE).toBe('data-amp-mask');
    });

    test('is a string', () => {
      expect(typeof TEXT_MASK_ATTRIBUTE).toBe('string');
    });
  });

  describe('MASKED_TEXT_VALUE', () => {
    test('has the correct value', () => {
      expect(MASKED_TEXT_VALUE).toBe('*****');
    });

    test('is a string', () => {
      expect(typeof MASKED_TEXT_VALUE).toBe('string');
    });
  });
});

describe('getPageTitle (core)', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'title', {
      value: 'Test Page Title',
      writable: true,
    });
  });

  afterEach(() => {
    const titleElements = document.querySelectorAll('title');
    titleElements.forEach((el) => el.remove());
  });

  test('returns document title when no title element has data-amp-mask', () => {
    const result = getPageTitle();
    expect(result).toBe('Test Page Title');
  });

  test('returns MASKED_TEXT_VALUE when title element has data-amp-mask attribute', () => {
    const titleElement = document.createElement('title');
    titleElement.setAttribute(TEXT_MASK_ATTRIBUTE, 'true');
    titleElement.textContent = 'Sensitive Title';
    document.head.appendChild(titleElement);

    const result = getPageTitle();
    expect(result).toBe(MASKED_TEXT_VALUE);
  });

  test('returns document title when title element exists but does not have data-amp-mask', () => {
    const titleElement = document.createElement('title');
    titleElement.textContent = 'Regular Title';
    document.head.appendChild(titleElement);

    const result = getPageTitle();
    expect(result).toBe('Test Page Title');
  });

  test('applies parse function when provided', () => {
    Object.defineProperty(document, 'title', {
      value: 'Contact us at test@example.com',
      writable: true,
    });

    const maskSensitiveEmail = (title: string) => title.replace(/[^\s@]+@[^\s@.]+\.[^\s@]+/g, MASKED_TEXT_VALUE);
    const result = getPageTitle(maskSensitiveEmail);
    expect(result).toBe('Contact us at *****');
  });

  test('returns empty string when document title is null or undefined', () => {
    Object.defineProperty(document, 'title', {
      value: null,
      writable: true,
    });

    const result = getPageTitle();
    expect(result).toBe('');

    Object.defineProperty(document, 'title', {
      value: 'Test Page Title',
      writable: true,
    });
  });

  test('returns empty string when document is undefined (server-side scenario)', () => {
    const globalWithDocument = global as typeof global & { document?: Document };
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalWithDocument, 'document');

    Object.defineProperty(globalWithDocument, 'document', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      const result = getPageTitle();
      expect(result).toBe('');
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalWithDocument, 'document', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalWithDocument, 'document');
      }
    }
  });
});
