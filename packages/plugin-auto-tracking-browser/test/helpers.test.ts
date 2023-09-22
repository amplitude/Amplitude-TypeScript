import {
  isNonSensitiveString,
  isTextNode,
  isNonSensitiveElement,
  getText,
  isPageUrlAllowed,
  getAttributesWithPrefix,
  isEmpty,
  removeEmptyProperties,
} from '../src/helpers';

describe('autoTrackingPlugin helpers', () => {
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

    test('should return false when element is a sensitive tag', () => {
      const element = document.createElement('a');
      const result = isNonSensitiveElement(element);
      expect(result).toEqual(true);
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
    const url = 'https://amplitude.com';

    test('should return true when allow list is not provided', () => {
      const result = isPageUrlAllowed(url, undefined);
      expect(result).toEqual(true);
    });

    test('should return true when allow list is empty', () => {
      const result = isPageUrlAllowed(url, []);
      expect(result).toEqual(true);
    });

    test('should return true when url is in the allow list', () => {
      const result = isPageUrlAllowed(url, ['https://amplitude.com']);
      expect(result).toEqual(true);
    });

    test('should return false when url is not in the allow list', () => {
      const result = isPageUrlAllowed(url, ['https://test.com']);
      expect(result).toEqual(false);
    });

    test('should return true when url is matching an item in the allow list', () => {
      const result = isPageUrlAllowed(url, ['http.?://amplitude.*', 'http.?://test.*']);
      expect(result).toEqual(true);
    });
  });

  describe('getAttributesWithPrefix', () => {
    test('should return attributes when matching the prefix', () => {
      const element = document.createElement('input');
      element.setAttribute('data-amp-auto-track-hello', 'world');
      element.setAttribute('data-amp-auto-track-time', 'machine');
      element.setAttribute('data-amp-auto-track-test', '');
      const result = getAttributesWithPrefix(element, 'data-amp-auto-track-');
      expect(result).toEqual({ hello: 'world', time: 'machine', test: '' });
    });

    test('should return empty attributes when no attribute name matching the prefix', () => {
      const element = document.createElement('input');
      element.setAttribute('data-hello', 'world');
      element.setAttribute('data-time', 'machine');
      const result = getAttributesWithPrefix(element, 'data-amp-auto-track-');
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
});
