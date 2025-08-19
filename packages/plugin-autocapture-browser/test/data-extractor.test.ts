import { DataExtractor } from '../src/data-extractor';
import * as constants from '../src/constants';
import { mockWindowLocationFromURL } from './utils';
import type { ElementBasedTimestampedEvent } from '../src/helpers';

describe('data extractor', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({ redactTextRegex: [/Florida|California/, /Pennsylvania/] });
  });

  describe('isNonSensitiveString', () => {
    test('should return false when text is missing', () => {
      const text = null;
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return true when text is not sensitive', () => {
      const text = 'test-string';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(true);
    });

    // https://www.paypalobjects.com/en_AU/vhelp/paypalmanager_help/credit_card_numbers.htm
    test('should return false when text is credit card format', () => {
      const sampleCreditCardNumbers = [
        // American Express
        '378282246310005',
        // American Express
        '371449635398431',
        // American Express Corporate
        '378734493671000',
        // Diners Club
        '30569309025904',
        // Diners Club
        '38520000023237',
        // Discover
        '6011111111111117',
        // Discover
        '6011000990139424',
        // JCB
        '3530111333300000',
        // JCB
        '3566002020360505',
        // MasterCard
        '5555555555554444',
        // MasterCard
        '5105105105105100',
        // Visa
        '4111111111111111',
        // Visa
        '4012888888881881',
        // Visa (13 digits). Note: Even though this number has a different character count than the other test numbers, it is the correct and functional number.
        '4222222222222',
        // Visa
        '4916024123820164',
      ];

      for (const text of sampleCreditCardNumbers) {
        const result = dataExtractor.isNonSensitiveString(text);
        expect(result).toEqual(false);
      }
    });

    test('should return false when text is social security number format', () => {
      const text = '269-28-9315';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return true when text is not a string', () => {
      const text = 123;
      const result = dataExtractor.isNonSensitiveString(text as unknown as string);
      expect(result).toEqual(true);
    });

    test('should return false when text is sensitive and matches redactTextRegex', () => {
      const text = 'Pittsburgh, Pennsylvania';
      const result = dataExtractor.isNonSensitiveString(text);

      const text2 = 'Florida';
      const result2 = dataExtractor.isNonSensitiveString(text2);

      expect(result).toEqual(false);
      expect(result2).toEqual(false);
    });

    test('should return true when text does not match redactTextRegex', () => {
      const text = 'Test string';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(true);
    });

    test('should parse rebactTextRegex objects into regex objects', () => {
      const dataExtractor = new DataExtractor({
        redactTextRegex: [
          { pattern: 'Florida|California', description: 'Florida or California' },
          { pattern: 'Pennsylvania', description: 'Pennsylvania' },
        ],
      });

      const text = 'Pittsburgh, Pennsylvania';
      const result = dataExtractor.isNonSensitiveString(text);

      const text2 = 'Florida';
      const result2 = dataExtractor.isNonSensitiveString(text2);

      expect(result).toEqual(false);
      expect(result2).toEqual(false);
    });

    test('should cap redactTextRegex over MAX_REDACT_TEXT_PATTERNS', () => {
      const overLimit = constants.MAX_REDACT_TEXT_PATTERNS + 5;
      const patterns = Array.from({ length: overLimit }, (_v, i) => new RegExp(`\\btoken${i + 1}\\b`));
      const extractor = new DataExtractor({ redactTextRegex: patterns });

      // Matches within the cap should be redacted
      expect(extractor.isNonSensitiveString(`token${constants.MAX_REDACT_TEXT_PATTERNS}`)).toEqual(false);
      // Matches beyond the cap should NOT be redacted
      expect(extractor.isNonSensitiveString(`token${constants.MAX_REDACT_TEXT_PATTERNS + 1}`)).toEqual(true);
    });
  });

  describe('getText', () => {
    test('should return empty string when element is sensitive', () => {
      const inputEl: HTMLInputElement = document.createElement('input');
      inputEl.value = 'test';
      const result = dataExtractor.getText(inputEl);
      expect(result).toEqual('');
    });

    test('should return text when element has text attribute', () => {
      const element = document.createElement('a');
      (element as unknown as { text: string }).text = 'test';
      const result = dataExtractor.getText(element);
      expect(result).toEqual('test');
    });

    test('should return text when element has text node', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit');
    });

    test('should return concatenated text when element has child text nodes', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = ' and pay';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit and pay');
    });

    test('should return concatenated text with sensitive text filtered', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = '269-28-9315';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit');
    });

    test('should return concatenated text with extra space removed', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.textContent = ' and   \n pay';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit and pay');
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

      const result = dataExtractor.getNearestLabel(input);
      expect(result).toEqual('nearest label');
    });

    test('should return redacted nearest label when content is sensitive', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = '4916024123820164';
      const input = document.createElement('input');
      div.appendChild(span);
      div.appendChild(input);

      const result = dataExtractor.getNearestLabel(input);
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

      const result = dataExtractor.getNearestLabel(input);
      expect(result).toEqual('parent label');
    });

    test('should return empty string when there is no parent', () => {
      const input = document.createElement('input');

      const result = dataExtractor.getNearestLabel(input);
      expect(result).toEqual('');
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
      expect(dataExtractor.getEventTagProps(inner as HTMLElement)).toEqual({
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': ' xxx ',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
      });
    });

    test('should return empty object when element is not present', () => {
      expect(dataExtractor.getEventTagProps(null as unknown as HTMLElement)).toEqual({});
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
      expect(dataExtractor.getEventTagProps(inner as HTMLElement)).toEqual({
        '[Amplitude] Element Tag': 'div',
        '[Amplitude] Element Text': ' xxx ',
        '[Amplitude] Page URL': 'https://www.amplitude.com/unit-test',
      });
    });
  });

  describe('addAdditionalEventProperties', () => {
    beforeEach(() => {
      // Mock window.location
      mockWindowLocationFromURL(new URL('https://test.com'));
      // Mock document.title
      Object.defineProperty(document, 'title', {
        value: 'Test Page',
        writable: true,
      });
      // Mock window.innerHeight and innerWidth
      Object.defineProperty(window, 'innerHeight', { value: 800 });
      Object.defineProperty(window, 'innerWidth', { value: 1200 });
    });

    test('should add properties when isCapturingCursorPointer is true and element has pointer cursor', () => {
      // Create a button element with pointer cursor
      const span = document.createElement('span');
      span.style.cursor = 'pointer';
      span.textContent = 'Click me';
      document.body.appendChild(span);

      // Create a click event
      const clickEvent = {
        bubbles: true,
        cancelable: true,
        view: window,
        target: span,
      };

      // Call the function with isCapturingCursorPointer set to true
      const result = dataExtractor.addAdditionalEventProperties(
        clickEvent,
        'click',
        ['.button'], // selector allowlist
        'data-amp-', // data attribute prefix
        true, // isCapturingCursorPointer
      ) as ElementBasedTimestampedEvent<MouseEvent>;

      // Verify the result
      expect(result.closestTrackedAncestor).toBeDefined();
    });
  });
});
