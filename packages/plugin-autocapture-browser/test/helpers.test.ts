import {
  isTextNode,
  isNonSensitiveElement,
  getAttributesWithPrefix,
  isEmpty,
  removeEmptyProperties,
  querySelectUniqueElements,
  getClosestElement,
  asyncLoadScript,
  generateUniqueId,
  createShouldTrackEvent,
  // ElementBasedTimestampedEvent,
} from '../src/helpers';
// import { mockWindowLocationFromURL } from './utils';

describe('autocapture-plugin helpers', () => {
  afterEach(() => {
    document.getElementsByTagName('body')[0].innerHTML = '';
    jest.clearAllMocks();
  });

  describe('isNonSensitiveString', () => {
    test('should return false when text is missing', () => {
      const text = null;
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return true when text is not sensitive', () => {
      const text = 'test-string';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(true);
    });

    test('should return false when text is credit card format', () => {
      const text = '4916024123820164';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text is social security number format', () => {
      const text = '269-28-9315';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text is email address format', () => {
      const text = 'user@example.com';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address within other text', () => {
      const text = 'Contact us at support@example.com for help';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address at the beginning', () => {
      const text = 'user@example.com is the admin';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address at the end', () => {
      const text = 'Send feedback to feedback@company.org';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains multiple email addresses', () => {
      const text = 'Contact admin@example.com or support@example.com';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when email has dots in domain name before final dot', () => {
      const text = 'user@sub.domain.example.com';
      const result = isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return true when text is not a string', () => {
      const text = 123;
      const result = isNonSensitiveString(text as unknown as string);
      expect(result).toEqual(true);
    });
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

  // moved to data-extractor.test.ts: getText

  describe('getAttributesWithPrefix', () => {
    test('should return attributes when matching the prefix', () => {
      const element = document.createElement('input');
      element.setAttribute('data-amp-track-hello', 'world');
      element.setAttribute('data-amp-track-time', 'machine');
      element.setAttribute('data-amp-track-test', '');
      const result = getAttributesWithPrefix(element, 'data-amp-track-');
      expect(result).toEqual({ hello: 'world', time: 'machine', test: '' });
    });

    test('should return empty attributes when no attribute name matching the prefix', () => {
      const element = document.createElement('input');
      element.setAttribute('data-hello', 'world');
      element.setAttribute('data-time', 'machine');
      const result = getAttributesWithPrefix(element, 'data-amp-track-');
      expect(result).toEqual({});
    });

    test('should return all attributes when prefix is empty string', () => {
      const element = document.createElement('input');
      element.setAttribute('data-hello', 'world');
      element.setAttribute('data-time', 'machine');
      const result = getAttributesWithPrefix(element, '');
      expect(result).toEqual({ 'data-hello': 'world', 'data-time': 'machine' });
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

  // moved to data-extractor.test.ts: getNearestLabel

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

  // moved to data-extractor.test.ts: getEventTagProps

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

  // moved to data-extractor.test.ts: addAdditionalEventProperties
});
