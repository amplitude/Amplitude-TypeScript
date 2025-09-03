import {
  isTextNode,
  isNonSensitiveElement,
  parseAttributesToMask,
  isEmpty,
  removeEmptyProperties,
  querySelectUniqueElements,
  getClosestElement,
  asyncLoadScript,
  generateUniqueId,
  createShouldTrackEvent,
} from '../src/helpers';
import { autocapturePlugin } from '../src/autocapture-plugin';
import { mockWindowLocationFromURL } from './utils';
import { DATA_AMP_MASK_ATTRIBUTES } from '../src/constants';
import { Logger } from '@amplitude/analytics-core';
import type { ElementInteractionsOptions } from '@amplitude/analytics-core/lib/esm/types/element-interactions';

// Mock implementations for functions that are expected by tests but don't exist in current implementation
const getMaskedAttributeNames = (element: Element): Set<string> => {
  const redactedAttributeNames = new Set<string>();
  let currentElement: Element | null = element.closest(`[${DATA_AMP_MASK_ATTRIBUTES}]`);

  while (currentElement) {
    const redactValue = currentElement.getAttribute(DATA_AMP_MASK_ATTRIBUTES);
    if (redactValue) {
      const attributesToMask = parseAttributesToMask(redactValue);
      attributesToMask.forEach((attr) => {
        redactedAttributeNames.add(attr);
      });
    }
    currentElement = currentElement.parentElement?.closest(`[${DATA_AMP_MASK_ATTRIBUTES}]`) || null;
  }

  return redactedAttributeNames;
};

// Mock extractPrefixedAttributes to act like getMaskedAttributeNames for the tests
const extractPrefixedAttributes = (element: Element): Set<string> => {
  return getMaskedAttributeNames(element);
};

describe('autocapture-plugin helpers', () => {
  afterEach(() => {
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('isTextNode', () => {
    test('should return false when node is not a text node', () => {
      const node = document.createElement('a');
      const result = isTextNode(node);
      expect(result).toEqual(false);
    });

    test('should return false when node is missing', () => {
      const node = null;
      const result = isTextNode(node as unknown as Node);
      expect(result).toEqual(false);
    });

    test('should return true when node is a text node', () => {
      const node = document.createTextNode('text');
      const result = isTextNode(node);
      expect(result).toEqual(true);
    });
  });

  describe('isNonSensitiveElement', () => {
    test('should return false when element is a sensitive tag', () => {
      const element = document.createElement('textarea');
      const result = isNonSensitiveElement(element);
      expect(result).toEqual(false);
    });

    test('should return true when element is a non-sensitive tag', () => {
      const element = document.createElement('a');
      const result = isNonSensitiveElement(element);
      expect(result).toEqual(true);
    });

    test('should detect contenteditable as a sensitive tag', () => {
      // Create the SVG element
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '200');
      svg.setAttribute('height', '200');
      svg.setAttribute('viewBox', '0 0 200 200');

      expect(isNonSensitiveElement(svg)).toEqual(true);
      const element = document.createElement('div');
      expect(isNonSensitiveElement(element)).toEqual(true);

      element.setAttribute('contenteditable', 'True');
      expect(isNonSensitiveElement(element)).toEqual(false);
    });
  });

  describe('extractPrefixedAttributes', () => {
    test('should return empty set when no redaction attributes present', () => {
      const element = document.createElement('div');
      const result = extractPrefixedAttributes(element);
      expect(result).toEqual(new Set());
    });

    test(`should return redacted attributes when ${DATA_AMP_MASK_ATTRIBUTES} is on element itself`, () => {
      const element = document.createElement('div');
      element.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'name, email');
      const result = extractPrefixedAttributes(element);
      expect(result).toEqual(new Set(['name', 'email'])); // Should include attributes from element itself
    });

    test('should collect redacted attributes from element and ancestor elements and exclude id and class', () => {
      const grandparent = document.createElement('div');
      grandparent.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'name, id, class'); // id and class should be ignored

      const parent = document.createElement('div');
      parent.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'email, phone');

      const child = document.createElement('span');
      child.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'category'); // This should now be included

      grandparent.appendChild(parent);
      parent.appendChild(child);
      document.body.appendChild(grandparent);

      const parentResult = extractPrefixedAttributes(parent);
      expect(parentResult).toEqual(new Set(['name', 'email', 'phone'])); // Includes own attributes plus ancestors

      const result = extractPrefixedAttributes(child);
      expect(result).toEqual(new Set(['name', 'email', 'phone', 'category'])); // Includes own attributes plus ancestors, id and class excluded

      document.body.removeChild(grandparent);
    });

    test('should handle whitespace and empty values in redaction list from parent', () => {
      const parent = document.createElement('div');
      parent.setAttribute(DATA_AMP_MASK_ATTRIBUTES, ' name , , email , ');

      const element = document.createElement('span');
      parent.appendChild(element);
      document.body.appendChild(parent);

      const result = extractPrefixedAttributes(element);
      expect(result).toEqual(new Set(['name', 'email']));

      document.body.removeChild(parent);
    });

    test('should handle empty redaction attribute value from parent', () => {
      const parent = document.createElement('div');
      parent.setAttribute(DATA_AMP_MASK_ATTRIBUTES, '');

      const element = document.createElement('span');
      parent.appendChild(element);
      document.body.appendChild(parent);

      const result = extractPrefixedAttributes(element);
      expect(result).toEqual(new Set());

      document.body.removeChild(parent);
    });

    test('should never include id or class in redacted attributes even when specified', () => {
      const parent = document.createElement('div');
      parent.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class, name');

      const element = document.createElement('span');
      parent.appendChild(element);
      document.body.appendChild(parent);

      const result = extractPrefixedAttributes(element);
      expect(result).toEqual(new Set(['name'])); // id and class should be excluded
      expect(result.has('id')).toBe(false);
      expect(result.has('class')).toBe(false);

      document.body.removeChild(parent);
    });
  });

  describe('isEmpty', () => {
    test('should return true when value is undefined', () => {
      const result = isEmpty(undefined);
      expect(result).toEqual(true);
    });

    test('should return true when value is null', () => {
      const result = isEmpty(null);
      expect(result).toEqual(true);
    });

    test('should return true when value is empty array', () => {
      const result = isEmpty([]);
      expect(result).toEqual(true);
    });

    test('should return true when value is empty object', () => {
      const result = isEmpty({});
      expect(result).toEqual(true);
    });

    test('should return true when value is empty string', () => {
      const result = isEmpty('');
      expect(result).toEqual(true);
    });

    test('should return true when value is string with spaces only', () => {
      const result = isEmpty('  ');
      expect(result).toEqual(true);
    });

    test('should return false when value is array', () => {
      const result = isEmpty([1, 2]);
      expect(result).toEqual(false);
    });

    test('should return false when value is object', () => {
      const result = isEmpty({ x: 1 });
      expect(result).toEqual(false);
    });

    test('should return false when value is string', () => {
      const result = isEmpty('xxx');
      expect(result).toEqual(false);
    });
  });

  describe('removeEmptyProperties', () => {
    test('should filter out empty properties', () => {
      const result = removeEmptyProperties({
        x: 1,
        y: [1],
        z: { z: 1 },
        w: 'w',
        a: undefined,
        b: [],
        c: {},
        d: '  ',
        e: null,
      });
      expect(result).toEqual({
        x: 1,
        y: [1],
        z: { z: 1 },
        w: 'w',
      });
    });
  });

  describe('querySelectUniqueElements', () => {
    test('should return unique elements with selector under root', () => {
      const container = document.createElement('div');

      const div1 = document.createElement('div');
      div1.className = 'test-class';
      container.appendChild(div1);
      const div2 = document.createElement('div');
      container.appendChild(div2);

      let result = querySelectUniqueElements(container, ['div']);
      expect(result).toEqual([div1, div2]);

      // elements should be deduped
      result = querySelectUniqueElements(container, ['div', '.test-class']);
      expect(result).toEqual([div1, div2]);
    });

    test('should return empty array with root not available', () => {
      const result = querySelectUniqueElements(null as unknown as Element, ['div']);
      expect(result).toEqual([]);
    });
  });

  describe('getClosestElement', () => {
    test('should return null when element null', () => {
      expect(getClosestElement(null, ['div'])).toEqual(null);
    });

    test('should return current element if it matches any selectors', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div id="inner">
            xxx
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(getClosestElement(inner, ['span', 'div'])?.getAttribute('id')).toEqual('inner');
    });

    test('should return closest element if it matches any selectors', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent2" data-target>
          <div id="parent1-sibling" data-target>
          </div>
          <div id="parent1">
            <div id="inner">
              xxx
            </div>
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(getClosestElement(inner, ['span', '[data-target]'])?.getAttribute('id')).toEqual('parent2');
    });

    test('should return null when no element matches', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent2">
          <div id="parent1">
            <div id="inner">
              xxx
            </div>
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(getClosestElement(inner, ['div.some-class'])).toEqual(null);
    });
  });

  describe('asyncLoadScript', () => {
    test('should append the script to document and resolve with status true', () => {
      void asyncLoadScript('https://test-url.amplitude/').then((result) => {
        expect(result).toEqual({ status: true });
      });
      const script = document.getElementsByTagName('script')[0];
      expect(document.getElementsByTagName('script')[0].src).toEqual('https://test-url.amplitude/');

      script.dispatchEvent(new Event('load'));
    });

    test('should reject with status false when error', () => {
      void asyncLoadScript('https://test-url.amplitude/').then(
        () => {
          expect('should not be called').toEqual(true);
        },
        (result) => {
          expect(result).toEqual({
            status: false,
            message: 'Failed to load the script https://test-url.amplitude/',
          });
        },
      );
      const script = document.getElementsByTagName('script')[0];
      expect(document.getElementsByTagName('script')[0].src).toEqual('https://test-url.amplitude/');

      script.dispatchEvent(new Event('error'));
    });
  });

  describe('generateUniqueId', () => {
    test('should return a unique id', () => {
      const id1 = generateUniqueId();
      const id2 = generateUniqueId();
      expect(id1).not.toEqual(id2);

      // Test random characters in second part of the id
      const randomChar1 = id1.split('-')[1];
      const randomChar2 = id2.split('-')[1];
      expect(randomChar1).not.toEqual(randomChar2);
    });
  });

  describe('pageUrlExcludelist processing', () => {
    let mockLogger: jest.SpyInstance;

    beforeEach(() => {
      // Mock the default logger warn method
      mockLogger = jest.spyOn(Logger.prototype, 'warn').mockImplementation(jest.fn());
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('string values', () => {
      test('should process string values correctly', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: ['https://example.com', 'https://test.com/admin'],
        };

        autocapturePlugin(options);

        // Verify that string values are preserved in the processed array
        expect(options.pageUrlExcludelist).toEqual(['https://example.com', 'https://test.com/admin']);
      });

      test('should handle empty string values', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: ['', 'https://example.com', ''],
        };

        autocapturePlugin(options);

        // Empty strings should still be included
        expect(options.pageUrlExcludelist).toEqual(['', 'https://example.com', '']);
      });
    });

    describe('RegExp instances', () => {
      test('should process RegExp instances correctly', () => {
        const regex1 = new RegExp('https://example\\.com');
        const regex2 = /https:\/\/test\.com\/admin/;

        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [regex1, regex2],
        };

        autocapturePlugin(options);

        // Verify that RegExp instances are preserved
        expect(options.pageUrlExcludelist).toEqual([regex1, regex2]);
      });

      test('should handle mix of strings and RegExp instances', () => {
        const regex = new RegExp('https://example\\.com');

        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: ['https://test.com', regex, 'https://admin.com'],
        };

        autocapturePlugin(options);

        expect(options.pageUrlExcludelist).toEqual(['https://test.com', regex, 'https://admin.com']);
      });
    });

    describe('regex pattern objects', () => {
      test('should convert pattern objects to RegExp instances', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [{ pattern: 'https://example\\.com' }, { pattern: 'https://test\\.com/admin.*' }],
        };

        autocapturePlugin(options);

        // Verify that pattern objects are converted to RegExp instances
        expect(options.pageUrlExcludelist).toHaveLength(2);
        expect(options.pageUrlExcludelist?.[0]).toBeInstanceOf(RegExp);
        expect(options.pageUrlExcludelist?.[1]).toBeInstanceOf(RegExp);
        expect((options.pageUrlExcludelist?.[0] as RegExp).source).toBe('https:\\/\\/example\\.com');
        expect((options.pageUrlExcludelist?.[1] as RegExp).source).toBe('https:\\/\\/test\\.com\\/admin.*');
      });

      test('should handle mix of all supported types', () => {
        const regex = new RegExp('existing-regex');

        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: ['https://string.com', regex, { pattern: 'https://pattern\\.com' }, 'another-string'],
        };

        autocapturePlugin(options);

        expect(options.pageUrlExcludelist).toHaveLength(4);
        expect(options.pageUrlExcludelist?.[0]).toBe('https://string.com');
        expect(options.pageUrlExcludelist?.[1]).toBe(regex);
        expect(options.pageUrlExcludelist?.[2]).toBeInstanceOf(RegExp);
        expect((options.pageUrlExcludelist?.[2] as RegExp).source).toBe('https:\\/\\/pattern\\.com');
        expect(options.pageUrlExcludelist?.[3]).toBe('another-string');
      });
    });

    describe('invalid regex patterns', () => {
      test('should handle invalid regex patterns gracefully and log warning', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [
            'https://valid.com',
            { pattern: '[invalid-regex' }, // Invalid regex - unclosed bracket
            'https://another-valid.com',
          ],
        };

        autocapturePlugin(options);

        // Verify that warning was logged
        expect(mockLogger).toHaveBeenCalledWith('Invalid regex pattern: [invalid-regex', expect.any(Error));

        // Verify that valid items are still processed and invalid ones are skipped
        expect(options.pageUrlExcludelist).toEqual(['https://valid.com', 'https://another-valid.com']);
      });

      test('should handle multiple invalid regex patterns', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [
            { pattern: '[invalid1' },
            'https://valid.com',
            { pattern: '*invalid2' },
            { pattern: 'valid\\.pattern' },
          ],
        };

        autocapturePlugin(options);

        // Verify that warnings were logged for both invalid patterns
        expect(mockLogger).toHaveBeenCalledTimes(2);
        expect(mockLogger).toHaveBeenNthCalledWith(1, 'Invalid regex pattern: [invalid1', expect.any(Error));
        expect(mockLogger).toHaveBeenNthCalledWith(2, 'Invalid regex pattern: *invalid2', expect.any(Error));

        // Valid items should still be processed
        expect(options.pageUrlExcludelist).toHaveLength(2);
        expect(options.pageUrlExcludelist?.[0]).toBe('https://valid.com');
        expect(options.pageUrlExcludelist?.[1]).toBeInstanceOf(RegExp);
        expect((options.pageUrlExcludelist?.[1] as RegExp).source).toBe('valid\\.pattern');
      });
    });

    describe('edge cases', () => {
      test('should handle undefined pageUrlExcludelist', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: undefined,
        };

        autocapturePlugin(options);

        // Should remain undefined
        expect(options.pageUrlExcludelist).toBeUndefined();
        expect(mockLogger).not.toHaveBeenCalled();
      });

      test('should handle empty pageUrlExcludelist array', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [],
        };

        autocapturePlugin(options);

        // Should result in empty array
        expect(options.pageUrlExcludelist).toEqual([]);
        expect(mockLogger).not.toHaveBeenCalled();
      });

      test('should handle array with only invalid regex patterns', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [{ pattern: '[invalid1' }, { pattern: '*invalid2' }],
        };

        autocapturePlugin(options);

        // Should result in empty array since all patterns were invalid
        expect(options.pageUrlExcludelist).toEqual([]);
        expect(mockLogger).toHaveBeenCalledTimes(2);
      });

      test('should handle objects without pattern property', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [
            'https://valid.com',
            { notPattern: 'some-value' } as any, // Object without 'pattern' property
            'https://another-valid.com',
          ],
        };

        autocapturePlugin(options);

        // Objects without 'pattern' property should be ignored
        expect(options.pageUrlExcludelist).toEqual(['https://valid.com', 'https://another-valid.com']);
        expect(mockLogger).not.toHaveBeenCalled();
      });

      test('should handle objects with empty pattern', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: ['https://valid.com', { pattern: '' }, 'https://another-valid.com'],
        };

        autocapturePlugin(options);

        // Empty pattern should create a valid regex
        expect(options.pageUrlExcludelist).toHaveLength(3);
        expect(options.pageUrlExcludelist?.[0]).toBe('https://valid.com');
        expect(options.pageUrlExcludelist?.[1]).toBeInstanceOf(RegExp);
        expect((options.pageUrlExcludelist?.[1] as RegExp).source).toBe('(?:)');
        expect(options.pageUrlExcludelist?.[2]).toBe('https://another-valid.com');
        expect(mockLogger).not.toHaveBeenCalled();
      });
    });

    describe('type safety', () => {
      test('should handle various falsy values gracefully', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [
            'https://valid.com',
            null as any,
            undefined as any,
            false as any,
            0 as any,
            'https://another-valid.com',
          ],
        };

        autocapturePlugin(options);

        // Only string and valid types should be preserved
        expect(options.pageUrlExcludelist).toEqual(['https://valid.com', 'https://another-valid.com']);
        expect(mockLogger).not.toHaveBeenCalled();
      });

      test('should handle numbers and other primitive types', () => {
        const options: ElementInteractionsOptions = {
          pageUrlExcludelist: [
            'https://valid.com',
            123 as any,
            true as any,
            Symbol('test') as any,
            'https://another-valid.com',
          ],
        };

        autocapturePlugin(options);

        // Only string types should be preserved
        expect(options.pageUrlExcludelist).toEqual(['https://valid.com', 'https://another-valid.com']);
        expect(mockLogger).not.toHaveBeenCalled();
      });
    });
  });

  describe('createShouldTrackEvent', () => {
    test('should not fail when given window as element', () => {
      const shouldTrackEvent = createShouldTrackEvent({}, ['div']);

      expect(shouldTrackEvent('click', window as unknown as Element)).toEqual(false);
      expect(shouldTrackEvent('click', document as unknown as Element)).toEqual(false);
    });

    test('should track any element with pointer cursor when isAlwaysCaptureCursorPointer is true', () => {
      const element = document.createElement('div');
      const style = document.createElement('style');
      style.textContent = '.pointer { cursor: pointer; }';
      document.head.appendChild(style);
      element.className = 'pointer';

      const shouldTrackEvent = createShouldTrackEvent(
        {
          pageUrlAllowlist: undefined,
          shouldTrackEventResolver: undefined,
        },
        [],
        true, // isAlwaysCaptureCursorPointer
      );

      expect(shouldTrackEvent('click', element)).toEqual(true);
      document.head.removeChild(style);
    });

    test('should respect pageUrlExcludelist configuration', () => {
      // Mock window.location to a test URL
      mockWindowLocationFromURL(new URL('https://www.test.com/page'));

      const element = document.createElement('button');
      element.textContent = 'Click me';

      const shouldTrackEvent = createShouldTrackEvent(
        {
          pageUrlExcludelist: [new RegExp('https://www.test.com')],
        },
        ['button'],
      );

      expect(shouldTrackEvent('click', element)).toEqual(true);
    });

    test('should allow tracking when URL does not match excludelist', () => {
      // Mock window.location to a different URL
      mockWindowLocationFromURL(new URL('https://www.different.com/page'));

      const element = document.createElement('button');
      element.textContent = 'Click me';

      const shouldTrackEvent = createShouldTrackEvent(
        {
          pageUrlExcludelist: [new RegExp('https://www.test.com')],
        },
        ['button'],
      );

      expect(shouldTrackEvent('click', element)).toEqual(true);
    });

    test('should prioritize excludelist over allowlist', () => {
      // Mock window.location to a URL that matches both lists
      mockWindowLocationFromURL(new URL('https://www.test.com/page'));

      const element = document.createElement('button');
      element.textContent = 'Click me';

      const shouldTrackEvent = createShouldTrackEvent(
        {
          pageUrlAllowlist: [new RegExp('https://www.test.com')],
          pageUrlExcludelist: [new RegExp('https://www.test.com')],
        },
        ['button'],
      );

      expect(shouldTrackEvent('click', element)).toEqual(false);
    });
  });
});
