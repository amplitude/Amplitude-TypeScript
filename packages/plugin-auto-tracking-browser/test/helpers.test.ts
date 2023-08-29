import { isNonSensitiveString, isTextNode, isNonSensitiveElement, getText } from '../src/helpers';

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
});
