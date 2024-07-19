import {
  isNonSensitiveString,
  isTextNode,
  isNonSensitiveElement,
  getText,
  getSelector,
  isPageUrlAllowed,
  getAttributesWithPrefix,
  isEmpty,
  removeEmptyProperties,
  getNearestLabel,
  querySelectUniqueElements,
  getClosestElement,
  getEventTagProps,
  asyncLoadScript,
  generateUniqueId,
  createShouldTrackEvent,
} from '../src/helpers';
import { mockWindowLocationFromURL } from './utils';
import { Logger } from '@amplitude/analytics-types';

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
    test('should return false when element is not a sensitive tag', () => {
      const element = document.createElement('textarea');
      const result = isNonSensitiveElement(element);
      expect(result).toEqual(false);
    });

    test('should return true when element is a sensitive tag', () => {
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

      element.setAttribute('contenteditable', 'true');
      expect(isNonSensitiveElement(element)).toEqual(true);
    });
  });

  describe('getText', () => {
    test('should return empty string when element is sensitive', () => {
      const element = document.createElement('input');
      element.value = 'test';
      const result = getText(element);
      expect(result).toEqual('');
    });

    test('should return text when element has text attribute', () => {
      const element = document.createElement('a');
      element.text = 'test';
      const result = getText(element);
      expect(result).toEqual('test');
    });

    test('should return text when element has text node', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const result = getText(button);
      expect(result).toEqual('submit');
    });

    test('should return concatenated text when element has child text nodes', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = ' and pay';
      button.appendChild(div);
      const result = getText(button);
      expect(result).toEqual('submit and pay');
    });

    test('should return concatenated text with sensitive text filtered', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = '269-28-9315';
      button.appendChild(div);
      const result = getText(button);
      expect(result).toEqual('submit');
    });

    test('should return concatenated text with extra space removed', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = ' and   \n pay';
      button.appendChild(div);
      const result = getText(button);
      expect(result).toEqual('submit and pay');
    });
  });

  describe('isPageUrlAllowed', () => {
    const url = 'https://amplitude.com/blog';

    test('should return true when allow list is not provided', () => {
      const result = isPageUrlAllowed(url, undefined);
      expect(result).toEqual(true);
    });

    test('should return true when allow list is empty', () => {
      const result = isPageUrlAllowed(url, []);
      expect(result).toEqual(true);
    });

    test('should return true only when full url string is in the allow list', () => {
      let result = isPageUrlAllowed(url, ['https://amplitude.com/blog']);
      expect(result).toEqual(true);

      result = isPageUrlAllowed('https://amplitude.com/market', ['https://amplitude.com/blog']);
      expect(result).toEqual(false);
    });

    test('should return true when url regex is in the allow list', () => {
      let result = isPageUrlAllowed(url, [new RegExp('https://amplitude.com/')]);
      expect(result).toEqual(true);

      result = isPageUrlAllowed('https://amplitude.com/market', [new RegExp('https://amplitude.com/')]);
      expect(result).toEqual(true);
    });

    test('should return false when url is not in the allow list at all', () => {
      const result = isPageUrlAllowed(url, ['https://test.com', new RegExp('https://test.com/')]);
      expect(result).toEqual(false);
    });

    test('should return true when url is matching an item in the allow list with regex wildcard', () => {
      const result = isPageUrlAllowed(url, [new RegExp('http.?://amplitude.*'), new RegExp('http.?://test.*')]);
      expect(result).toEqual(true);
    });
  });

  describe('getSelector', () => {
    test('should return the selector with finder', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
        </div>
      `;
      const inner = document.createElement('div');
      const container = document.getElementById('container');
      container?.appendChild(inner);
      expect(getSelector(inner)).toEqual('#container > div');
    });

    test('should use fallback logic with element id to get selector when finder has error', () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const container = document.createElement('container');
      container.innerHTML = `<div id="inner"></div>`;
      const inner = container.querySelector('#inner');

      // This is a floating element, so finder will throw error as it cannot find it in the document tree.
      // This case might happen as some of the element might be removed from the DOM tree before the selector is retrieved.
      const result = getSelector(inner as HTMLElement, loggerProvider as Logger);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(loggerProvider.warn).toHaveBeenCalledWith(
        `Failed to get selector with finder, use fallback strategy instead: Error: Can't select any node with this selector: #inner`,
      );
      expect(result).toEqual('#inner');
    });

    test('should use fallback logic with class to get selector when finder has error', () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const container = document.createElement('container');
      container.innerHTML = `<div class="inner"></div>`;
      const inner = container.querySelector('.inner');

      // This is a floating element, so finder will throw error as it cannot find it in the document tree.
      // This case might happen as some of the element might be removed from the DOM tree before the selector is retrieved.
      const result = getSelector(inner as HTMLElement, loggerProvider as Logger);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(loggerProvider.warn).toHaveBeenCalledWith(
        `Failed to get selector with finder, use fallback strategy instead: Error: Can't select any node with this selector: .inner`,
      );
      expect(result).toEqual('div.inner');
    });

    test('should use fallback logic with tag to get selector when finder has error', () => {
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
        warn: jest.fn(),
      };
      const container = document.createElement('container');
      container.innerHTML = `<div class="amp-visual-tagging-selector-highlight"></div>`;
      const inner = container.querySelector('.amp-visual-tagging-selector-highlight');

      // This is a floating element, so finder will throw error as it cannot find it in the document tree.
      // This case might happen as some of the element might be removed from the DOM tree before the selector is retrieved.
      const result = getSelector(inner as HTMLElement, loggerProvider as Logger);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(loggerProvider.warn).toHaveBeenCalledWith(
        `Failed to get selector with finder, use fallback strategy instead: Error: Can't select any node with this selector: div`,
      );
      expect(result).toEqual('div');
    });
  });

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

  describe('getNearestLabel', () => {
    test('should return nearest label of the element', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = 'nearest label';
      const input = document.createElement('input');
      div.appendChild(span);
      div.appendChild(input);

      const result = getNearestLabel(input);
      expect(result).toEqual('nearest label');
    });

    test('should return redacted nearest label when content is sensitive', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = '4916024123820164';
      const input = document.createElement('input');
      div.appendChild(span);
      div.appendChild(input);

      const result = getNearestLabel(input);
      expect(result).toEqual('');
    });

    test('should return nearest label of the element parent', () => {
      const div = document.createElement('div');
      const innerDiv = document.createElement('div');
      div.appendChild(innerDiv);
      const span = document.createElement('span');
      span.textContent = 'parent label';
      div.appendChild(span);
      const input = document.createElement('input');
      innerDiv.appendChild(input);

      const result = getNearestLabel(input);
      expect(result).toEqual('parent label');
    });

    test('should return empty string when there is no parent', () => {
      const input = document.createElement('input');

      const result = getNearestLabel(input);
      expect(result).toEqual('');
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
      expect(getClosestElement(inner, ['span', 'div'])?.id).toEqual('inner');
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
      expect(getClosestElement(inner, ['span', '[data-target]'])?.id).toEqual('parent2');
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

  describe('getEventTagProps', () => {
    beforeAll(() => {
      Object.defineProperty(window, 'location', {
        value: {
          hostname: '',
          href: '',
          pathname: '',
          search: '',
        },
        writable: true,
      });
    });

    beforeEach(() => {
      mockWindowLocationFromURL(new URL('https://www.amplitude.com/unit-test?query=getEventTagProps'));
    });

    test('should return the tag properties', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div id="inner">
            xxx
          </div>
        </div>
      `;

      const inner = document.getElementById('inner');
      expect(getEventTagProps(inner as HTMLElement)).toEqual({
        '[Amplitude] Element Selector': '#inner',
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': ' xxx ',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
      });
    });

    test('should return empty object when element is not present', () => {
      expect(getEventTagProps(null as unknown as HTMLElement)).toEqual({});
    });

    test('should not use the visual highlight class when retrieving selector', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="container">
          <div class="amp-visual-tagging-selector-highlight">
            xxx
          </div>
        </div>
      `;

      const inner = document.getElementsByClassName('amp-visual-tagging-selector-highlight')[0];
      expect(getEventTagProps(inner as HTMLElement)).toEqual({
        '[Amplitude] Element Selector': '#container > div',
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': ' xxx ',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
      });
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
  });
});
