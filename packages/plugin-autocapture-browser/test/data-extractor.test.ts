import { DataExtractor } from '../src/data-extractor';
import * as constants from '../src/constants';
import { mockWindowLocationFromURL } from './utils';
import type { ElementBasedTimestampedEvent } from '../src/helpers';

describe('data extractor', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({ maskTextRegex: [/Florida|California/, /Pennsylvania/] });
  });

  describe('isNonSensitiveString', () => {
    test('should return true when text is null or undefined', () => {
      const nullText = null;
      const undefinedText = undefined;
      const result = dataExtractor.isNonSensitiveString(nullText);
      const result2 = dataExtractor.isNonSensitiveString(undefinedText as unknown as string);
      expect(result).toEqual(true);
      expect(result2).toEqual(true);
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

    test('should return false when text is sensitive and matches maskTextRegex', () => {
      const text = 'Pittsburgh, Pennsylvania';
      const result = dataExtractor.isNonSensitiveString(text);

      const text2 = 'Florida';
      const result2 = dataExtractor.isNonSensitiveString(text2);

      expect(result).toEqual(false);
      expect(result2).toEqual(false);
    });

    test('should return true when text does not match maskTextRegex', () => {
      const text = 'Test string';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(true);
    });

    test('should parse rebactTextRegex objects into regex objects', () => {
      const dataExtractor = new DataExtractor({
        maskTextRegex: [
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

    test('should cap maskTextRegex over MAX_MASK_TEXT_PATTERNS', () => {
      const overLimit = constants.MAX_MASK_TEXT_PATTERNS + 5;
      const patterns = Array.from({ length: overLimit }, (_v, i) => new RegExp(`\\btoken${i + 1}\\b`));
      const extractor = new DataExtractor({ maskTextRegex: patterns });

      // Matches within the cap should be masked
      expect(extractor.isNonSensitiveString(`token${constants.MAX_MASK_TEXT_PATTERNS}`)).toEqual(false);
      // Matches beyond the cap should NOT be masked
      expect(extractor.isNonSensitiveString(`token${constants.MAX_MASK_TEXT_PATTERNS + 1}`)).toEqual(true);
    });

    test('should return false when text is email address format', () => {
      const text = 'user@example.com';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address within other text', () => {
      const text = 'Contact us at support@example.com for help';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address at the beginning', () => {
      const text = 'user@example.com is the admin';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains email address at the end', () => {
      const text = 'Send feedback to feedback@company.org';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when text contains multiple email addresses', () => {
      const text = 'Contact admin@example.com or support@example.com';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
    });

    test('should return false when email has dots in domain name before final dot', () => {
      const text = 'user@sub.domain.example.com';
      const result = dataExtractor.isNonSensitiveString(text);
      expect(result).toEqual(false);
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

    test('should return MASKED_TEXT_VALUE when element has data-amp-mask attribute', () => {
      const button = document.createElement('button');
      button.setAttribute('data-amp-mask', 'true');
      button.textContent = 'sensitive button text';
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return MASKED_TEXT_VALUE when parent element has data-amp-mask attribute', () => {
      const container = document.createElement('div');
      container.setAttribute('data-amp-mask', 'true');
      const button = document.createElement('button');
      button.textContent = 'button text';
      container.appendChild(button);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return MASKED_TEXT_VALUE when ancestor element has data-amp-mask attribute', () => {
      const grandparent = document.createElement('div');
      grandparent.setAttribute('data-amp-mask', 'true');
      const parent = document.createElement('div');
      const button = document.createElement('button');
      button.textContent = 'nested button text';
      grandparent.appendChild(parent);
      parent.appendChild(button);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should filter out sensitive text content containing credit card numbers', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Pay with card ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.textContent = '4111111111111111'; // Credit card number
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' securely');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('Pay with card  securely');
    });

    test('should filter out sensitive text content containing SSN', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Submit form ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.textContent = '269-28-9315'; // SSN
      button.appendChild(sensitiveDiv);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('Submit form');
    });

    test('should filter out sensitive text content containing email addresses', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Contact ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.textContent = 'user@example.com'; // Email
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' for support');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('Contact  for support');
    });

    test('should filter out text matching custom maskTextRegex patterns', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Welcome to ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.textContent = 'Florida'; // Matches the regex pattern in beforeEach
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' tourism');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('Welcome to  tourism');
    });

    test('should handle mixed content with both masked attribute and sensitive text filtering', () => {
      const container = document.createElement('div');
      const maskedDiv = document.createElement('div');
      maskedDiv.setAttribute('data-amp-mask', 'true');
      maskedDiv.textContent = 'This should be masked';

      const normalDiv = document.createElement('div');
      normalDiv.textContent = 'Normal text ';

      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.textContent = '4111111111111111'; // This would be filtered by sensitive text logic

      container.appendChild(normalDiv);
      container.appendChild(maskedDiv);
      container.appendChild(sensitiveDiv);

      // Test the masked div individually
      const maskedResult = dataExtractor.getText(maskedDiv);
      expect(maskedResult).toEqual(constants.MASKED_TEXT_VALUE);

      // Test container with mixed content - masked elements return MASKED_TEXT_VALUE, sensitive text is filtered out
      const containerResult = dataExtractor.getText(container);
      expect(containerResult).toEqual(`Normal text ${constants.MASKED_TEXT_VALUE}`);
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

    test('should return masked nearest label when content is sensitive', () => {
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
        '[Amplitude] Element Text': 'xxx',
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
        '[Amplitude] Element Text': 'xxx',
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
