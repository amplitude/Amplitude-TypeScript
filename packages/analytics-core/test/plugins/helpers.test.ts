/** @jest-environment jsdom */
import {
  MASKED_TEXT_VALUE,
  TEXT_MASK_ATTRIBUTE,
  getPageTitle,
  replaceSensitiveString,
  CC_REGEX,
  SSN_REGEX,
  EMAIL_REGEX,
} from '../../src/plugins/helpers';

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

describe('Regex Constants', () => {
  test('CC_REGEX is a RegExp', () => {
    expect(CC_REGEX).toBeInstanceOf(RegExp);
  });

  test('SSN_REGEX is a RegExp', () => {
    expect(SSN_REGEX).toBeInstanceOf(RegExp);
  });

  test('EMAIL_REGEX is a RegExp', () => {
    expect(EMAIL_REGEX).toBeInstanceOf(RegExp);
  });
});

describe('replaceSensitiveString', () => {
  describe('null and undefined inputs', () => {
    test('should return empty string when text is null', () => {
      const result = replaceSensitiveString(null);
      expect(result).toBe('');
    });

    test('should return empty string when text is undefined', () => {
      const result = replaceSensitiveString(undefined as unknown as string);
      expect(result).toBe('');
    });

    test('should return empty string when text is not a string', () => {
      const result = replaceSensitiveString(123 as unknown as string);
      expect(result).toBe('');
    });
  });

  describe('non-sensitive text', () => {
    test('should return original text when text is not sensitive', () => {
      const text = 'test-string';
      const result = replaceSensitiveString(text);
      expect(result).toBe('test-string');
    });

    test('should return original text with no patterns', () => {
      const text = 'Hello World';
      const result = replaceSensitiveString(text);
      expect(result).toBe('Hello World');
    });
  });

  describe('credit card masking', () => {
    // https://www.paypalobjects.com/en_AU/vhelp/paypalmanager_help/credit_card_numbers.htm
    test('should mask credit card numbers', () => {
      const sampleCreditCardNumbers = [
        '378282246310005', // American Express
        '371449635398431', // American Express
        '378734493671000', // American Express Corporate
        '30569309025904', // Diners Club
        '38520000023237', // Diners Club
        '6011111111111117', // Discover
        '6011000990139424', // Discover
        '3530111333300000', // JCB
        '3566002020360505', // JCB
        '5555555555554444', // MasterCard
        '5105105105105100', // MasterCard
        '4111111111111111', // Visa
        '4012888888881881', // Visa
        '4222222222222', // Visa (13 digits)
        '4916024123820164', // Visa
      ];

      for (const ccNumber of sampleCreditCardNumbers) {
        const result = replaceSensitiveString(ccNumber);
        expect(result).toBe(MASKED_TEXT_VALUE);
      }
    });

    test('should handle credit card numbers with spaces', () => {
      const text = '4111 1111 1111 1111';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });

    test('should handle credit card numbers with dashes', () => {
      const text = '4111-1111-1111-1111';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });

    test('should handle credit card numbers with mixed spaces and dashes', () => {
      const text = '4111 1111-1111 1111';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });
  });

  describe('SSN masking', () => {
    test('should mask social security numbers', () => {
      const text = '269-28-9315';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });

    test('should mask SSN without dashes', () => {
      const text = '269289315';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });
  });

  describe('email masking', () => {
    test('should mask email addresses', () => {
      const text = 'user@example.com';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });

    test('should mask email within text', () => {
      const text = 'Contact us at support@example.com for help';
      const result = replaceSensitiveString(text);
      expect(result).toBe(`Contact us at ${MASKED_TEXT_VALUE} for help`);
    });

    test('should mask email at the beginning', () => {
      const text = 'user@example.com is the admin';
      const result = replaceSensitiveString(text);
      expect(result).toBe(`${MASKED_TEXT_VALUE} is the admin`);
    });

    test('should mask email at the end', () => {
      const text = 'The admin is user@example.com';
      const result = replaceSensitiveString(text);
      expect(result).toBe(`The admin is ${MASKED_TEXT_VALUE}`);
    });

    test('should mask multiple emails', () => {
      const text = 'Contact user@example.com or admin@test.org';
      const result = replaceSensitiveString(text);
      expect(result).toBe(`Contact ${MASKED_TEXT_VALUE} or ${MASKED_TEXT_VALUE}`);
    });

    test('should mask email with dots in domain', () => {
      const text = 'user@mail.example.com';
      const result = replaceSensitiveString(text);
      expect(result).toBe(MASKED_TEXT_VALUE);
    });
  });

  describe('custom patterns', () => {
    test('should mask text matching custom regex patterns', () => {
      const customPattern = /Florida|California/;
      const text = 'I live in Florida';
      const result = replaceSensitiveString(text, [customPattern]);
      expect(result).toBe(`I live in ${MASKED_TEXT_VALUE}`);
    });

    test('should mask text with multiple custom patterns', () => {
      const patterns = [/Florida|California/, /Pennsylvania/];
      const text1 = 'Pittsburgh, Pennsylvania';
      const text2 = 'Florida';

      expect(replaceSensitiveString(text1, patterns)).toBe(`Pittsburgh, ${MASKED_TEXT_VALUE}`);
      expect(replaceSensitiveString(text2, patterns)).toBe(MASKED_TEXT_VALUE);
    });

    test('should handle invalid patterns gracefully', () => {
      // Create an invalid regex that will throw on replace
      const badPattern = /test/;
      // Override the replace method to throw
      Object.defineProperty(badPattern, Symbol.replace, {
        value: () => {
          throw new Error('Invalid pattern');
        },
      });

      const text = 'test string';
      const result = replaceSensitiveString(text, [badPattern]);
      // Should still process other built-in patterns
      expect(result).toBeDefined();
    });

    test('should apply custom patterns after built-in patterns', () => {
      const customPattern = /secret/gi;
      const text = 'user@example.com has a secret';
      const result = replaceSensitiveString(text, [customPattern]);
      expect(result).toBe(`${MASKED_TEXT_VALUE} has a ${MASKED_TEXT_VALUE}`);
    });
  });

  describe('combined masking', () => {
    test('should mask multiple types of sensitive data', () => {
      const text = 'Email: user@example.com CC: 4111111111111111 SSN: 123-45-6789';
      const result = replaceSensitiveString(text);
      expect(result).toBe(`Email: ${MASKED_TEXT_VALUE} CC: ${MASKED_TEXT_VALUE} SSN: ${MASKED_TEXT_VALUE}`);
    });

    test('should mask built-in and custom patterns together', () => {
      const customPattern = /secret/gi;
      const text = 'secret data: user@example.com';
      const result = replaceSensitiveString(text, [customPattern]);
      expect(result).toBe(`${MASKED_TEXT_VALUE} data: ${MASKED_TEXT_VALUE}`);
    });
  });

  describe('edge cases', () => {
    test('should handle empty string', () => {
      const result = replaceSensitiveString('');
      expect(result).toBe('');
    });

    test('should handle empty custom patterns array', () => {
      const text = 'test string';
      const result = replaceSensitiveString(text, []);
      expect(result).toBe('test string');
    });

    test('should handle text with only sensitive data', () => {
      const result = replaceSensitiveString('user@example.com');
      expect(result).toBe(MASKED_TEXT_VALUE);
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
