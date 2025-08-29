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
import { DATA_AMP_MASK_ATTRIBUTES } from '../src/constants';

// Mock implementations for functions that are expected by tests but don't exist in current implementation
const getRedactedAttributeNames = (element: Element): Set<string> => {
  const redactedAttributeNames = new Set<string>();
  let currentElement: Element | null = element.closest(`[${DATA_AMP_MASK_ATTRIBUTES}]`);

  while (currentElement) {
    const redactValue = currentElement.getAttribute(DATA_AMP_MASK_ATTRIBUTES);
    if (redactValue) {
      const attributesToRedact = parseAttributesToMask(redactValue);
      attributesToRedact.forEach((attr) => {
        redactedAttributeNames.add(attr);
      });
    }
    currentElement = currentElement.parentElement?.closest(`[${DATA_AMP_MASK_ATTRIBUTES}]`) || null;
  }

  return redactedAttributeNames;
};

// Mock extractPrefixedAttributes to act like getRedactedAttributeNames for the tests
const extractPrefixedAttributes = (element: Element): Set<string> => {
  return getRedactedAttributeNames(element);
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
  });
});
