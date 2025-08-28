import { DataExtractor } from '../src/data-extractor';
import * as constants from '../src/constants';
import { mockWindowLocationFromURL } from './utils';
import type { ElementBasedTimestampedEvent } from '../src/helpers';
import { DATA_AMP_MASK_ATTRIBUTES } from '../src/constants';

describe('data extractor', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({ maskTextRegex: [/Florida|California/, /Pennsylvania/] });
  });

  describe('replaceSensitiveString', () => {
    test('should return empty string when text is null or undefined', () => {
      const nullText = null;
      const undefinedText = undefined;
      const result = dataExtractor.replaceSensitiveString(nullText);
      const result2 = dataExtractor.replaceSensitiveString(undefinedText as unknown as string);
      expect(result).toEqual('');
      expect(result2).toEqual('');
    });

    test('should return original text when text is not sensitive', () => {
      const text = 'test-string';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual('test-string');
    });

    // https://www.paypalobjects.com/en_AU/vhelp/paypalmanager_help/credit_card_numbers.htm
    test('should return masked text when text is credit card format', () => {
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
        const result = dataExtractor.replaceSensitiveString(text);
        expect(result).toEqual(constants.MASKED_TEXT_VALUE);
      }
    });

    test('should return masked text when text is social security number format', () => {
      const text = '269-28-9315';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return empty string when text is not a string', () => {
      const text = 123;
      const result = dataExtractor.replaceSensitiveString(text as unknown as string);
      expect(result).toEqual('');
    });

    test('should return masked text when text is sensitive and matches maskTextRegex', () => {
      const text = 'Pittsburgh, Pennsylvania';
      const result = dataExtractor.replaceSensitiveString(text);

      const text2 = 'Florida';
      const result2 = dataExtractor.replaceSensitiveString(text2);

      expect(result).toEqual(`Pittsburgh, ${constants.MASKED_TEXT_VALUE}`);
      expect(result2).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return original text when text does not match maskTextRegex', () => {
      const text = 'Test string';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual('Test string');
    });

    test('should parse maskTextRegex objects into regex objects', () => {
      const dataExtractor = new DataExtractor({
        maskTextRegex: [
          { pattern: 'Florida|California', description: 'Florida or California' },
          { pattern: 'Pennsylvania', description: 'Pennsylvania' },
        ],
      });

      const text = 'Pittsburgh, Pennsylvania';
      const result = dataExtractor.replaceSensitiveString(text);

      const text2 = 'Florida';
      const result2 = dataExtractor.replaceSensitiveString(text2);

      expect(result).toEqual(`Pittsburgh, ${constants.MASKED_TEXT_VALUE}`);
      expect(result2).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should cap maskTextRegex over MAX_MASK_TEXT_PATTERNS', () => {
      const overLimit = constants.MAX_MASK_TEXT_PATTERNS + 5;
      const patterns = Array.from({ length: overLimit }, (_v, i) => new RegExp(`\\btoken${i + 1}\\b`));
      const extractor = new DataExtractor({ maskTextRegex: patterns });

      // Matches within the cap should be masked
      expect(extractor.replaceSensitiveString(`token${constants.MAX_MASK_TEXT_PATTERNS}`)).toEqual(
        constants.MASKED_TEXT_VALUE,
      );
      // Matches beyond the cap should NOT be masked
      expect(extractor.replaceSensitiveString(`token${constants.MAX_MASK_TEXT_PATTERNS + 1}`)).toEqual(
        `token${constants.MAX_MASK_TEXT_PATTERNS + 1}`,
      );
    });

    test('should return masked text when text is email address format', () => {
      const text = 'user@example.com';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return masked text when text contains email address within other text', () => {
      const text = 'Contact us at support@example.com for help';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Contact us at ${constants.MASKED_TEXT_VALUE} for help`);
    });

    test('should return masked text when text contains email address at the beginning', () => {
      const text = 'user@example.com is the admin';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`${constants.MASKED_TEXT_VALUE} is the admin`);
    });

    test('should return masked text when text contains email address at the end', () => {
      const text = 'Send feedback to feedback@company.org';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Send feedback to ${constants.MASKED_TEXT_VALUE}`);
    });

    test('should return masked text when text contains multiple email addresses', () => {
      const text = 'Contact admin@example.com or support@example.com';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Contact ${constants.MASKED_TEXT_VALUE} or ${constants.MASKED_TEXT_VALUE}`);
    });

    test('should return masked text when email has dots in domain name before final dot', () => {
      const text = 'user@sub.domain.example.com';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should handle credit card numbers with spaces', () => {
      const text = 'Card number: 4111 1111 1111 1111';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Card number: ${constants.MASKED_TEXT_VALUE}`);
    });

    test('should handle credit card numbers with dashes', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Card: ${constants.MASKED_TEXT_VALUE}`);
    });

    test('should handle credit card numbers with mixed spaces and dashes', () => {
      const text = 'Payment: 4111 1111-1111 1111';
      const result = dataExtractor.replaceSensitiveString(text);
      expect(result).toEqual(`Payment: ${constants.MASKED_TEXT_VALUE}`);
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
      div.innerText = ' and pay';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit and pay');
    });

    test('should return concatenated text with sensitive text masked', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.innerText = '269-28-9315';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`submit${constants.MASKED_TEXT_VALUE}`);
    });

    test('should return concatenated text with extra space removed', () => {
      const button = document.createElement('button');
      const buttonText = document.createTextNode('submit');
      button.appendChild(buttonText);
      const div = document.createElement('div');
      div.innerText = ' and   \n pay';
      button.appendChild(div);
      const result = dataExtractor.getText(button);
      expect(result).toEqual('submit and pay');
    });

    test('should return MASKED_TEXT_VALUE when element has data-amp-mask attribute', () => {
      const button = document.createElement('button');
      button.setAttribute('data-amp-mask', 'true');
      button.innerText = 'sensitive button text';
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return MASKED_TEXT_VALUE when parent element has data-amp-mask attribute', () => {
      const container = document.createElement('div');
      container.setAttribute('data-amp-mask', 'true');
      const button = document.createElement('button');
      button.innerText = 'button text';
      container.appendChild(button);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return MASKED_TEXT_VALUE when ancestor element has data-amp-mask attribute', () => {
      const grandparent = document.createElement('div');
      grandparent.setAttribute('data-amp-mask', 'true');
      const parent = document.createElement('div');
      const button = document.createElement('button');
      button.innerText = 'nested button text';
      grandparent.appendChild(parent);
      parent.appendChild(button);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should mask sensitive text content containing credit card numbers', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Pay with card ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = '4111111111111111'; // Credit card number
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' securely');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`Pay with card ${constants.MASKED_TEXT_VALUE} securely`);
    });

    test('should mask sensitive text content containing SSN', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Submit form ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = '269-28-9315'; // SSN
      button.appendChild(sensitiveDiv);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`Submit form ${constants.MASKED_TEXT_VALUE}`);
    });

    test('should mask sensitive text content containing email addresses', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Contact ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = 'user@example.com'; // Email
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' for support');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`Contact ${constants.MASKED_TEXT_VALUE} for support`);
    });

    test('should mask text matching custom maskTextRegex patterns', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Welcome to ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = 'Florida'; // Matches the regex pattern in beforeEach
      button.appendChild(sensitiveDiv);
      const moreText = document.createTextNode(' tourism');
      button.appendChild(moreText);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`Welcome to ${constants.MASKED_TEXT_VALUE} tourism`);
    });

    test('should handle mixed content with both masked attribute and sensitive text masking', () => {
      const container = document.createElement('div');
      const maskedDiv = document.createElement('div');
      maskedDiv.setAttribute('data-amp-mask', 'true');
      maskedDiv.innerText = 'This should be masked';

      const normalDiv = document.createElement('div');
      normalDiv.innerText = 'Normal text ';

      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = '4111111111111111'; // This would be filtered by sensitive text logic

      container.appendChild(normalDiv);
      container.appendChild(maskedDiv);
      container.appendChild(sensitiveDiv);

      // Test the masked div individually
      const maskedResult = dataExtractor.getText(maskedDiv);
      expect(maskedResult).toEqual(constants.MASKED_TEXT_VALUE);

      // Test container with mixed content - masked elements return MASKED_TEXT_VALUE, sensitive text is also masked
      const containerResult = dataExtractor.getText(container);
      expect(containerResult).toEqual(`Normal text ${constants.MASKED_TEXT_VALUE}${constants.MASKED_TEXT_VALUE}`);
    });

    test('should return empty string when cloned tree has null innerText and textContent', () => {
      const container = document.createElement('div');
      const maskedChild = document.createElement('div');
      maskedChild.setAttribute('data-amp-mask', 'true');
      maskedChild.innerText = 'masked content';
      container.appendChild(maskedChild);

      // Mock cloneNode to return an element where both innerText and textContent are null
      const originalCloneNode = container.cloneNode.bind(container);
      container.cloneNode = jest.fn().mockImplementation((deep: boolean) => {
        const clonedElement = originalCloneNode(deep) as HTMLElement;
        // Override the text properties to return null
        Object.defineProperty(clonedElement, 'innerText', {
          get: () => null,
          configurable: true,
        });
        Object.defineProperty(clonedElement, 'innerText', {
          get: () => null,
          configurable: true,
        });
        return clonedElement;
      });

      const result = dataExtractor.getText(container);
      expect(result).toEqual('');

      // Restore original cloneNode
      container.cloneNode = originalCloneNode;
    });
  });

  describe('getNearestLabel', () => {
    test('should return nearest label of the element', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.innerText = 'nearest label';
      const input = document.createElement('input');
      div.appendChild(span);
      div.appendChild(input);

      const result = dataExtractor.getNearestLabel(input);
      expect(result).toEqual('nearest label');
    });

    test('should return masked nearest label when content is sensitive', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.innerText = '4916024123820164';
      const input = document.createElement('input');
      div.appendChild(span);
      div.appendChild(input);

      const result = dataExtractor.getNearestLabel(input);
      expect(result).toEqual(constants.MASKED_TEXT_VALUE);
    });

    test('should return nearest label of the element parent', () => {
      const div = document.createElement('div');
      const innerDiv = document.createElement('div');
      div.appendChild(innerDiv);
      const span = document.createElement('span');
      span.innerText = 'parent label';
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
      span.innerText = 'Click me';
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

  describe('getEventProperties with redaction', () => {
    test('should NOT redact id or class when both specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class');

      const element = document.createElement('button');
      element.setAttribute('id', 'secret-id');
      element.setAttribute('class', 'secret-class');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('secret-id'); // ID should NOT be redacted
      expect(result['[Amplitude] Element Class']).toBe('secret-class'); // Class should NOT be redacted
      expect(result['[Amplitude] Element Tag']).toBe('button');
      expect(result['[Amplitude] Element Text']).toBe('Click me');

      document.body.removeChild(container);
    });

    test('should redact attributes when redaction rule is on element itself but never redact id or class', () => {
      const element = document.createElement('button');
      element.setAttribute('id', 'test-id');
      element.setAttribute('class', 'test-class');
      element.setAttribute('aria-label', 'Test button');
      element.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class, aria-label'); // On element itself
      element.textContent = 'Click me';

      document.body.appendChild(element);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('test-id'); // ID should NEVER be redacted
      expect(result['[Amplitude] Element Class']).toBe('test-class'); // Class should NEVER be redacted
      expect(result['[Amplitude] Element Aria Label']).toBeUndefined(); // Aria-label should be redacted

      document.body.removeChild(element);
    });

    test('should redact aria-label when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'aria-label');

      const element = document.createElement('button');
      element.setAttribute('aria-label', 'Secret button label');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Aria Label']).toBeUndefined();
      expect(result['[Amplitude] Element Text']).toBe('Click me');

      document.body.removeChild(container);
    });

    test('should redact href for anchor elements when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'href');

      const element = document.createElement('a');
      element.setAttribute('href', 'https://secret-url.com');
      element.textContent = 'Secret link';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Href']).toBeUndefined();
      expect(result['[Amplitude] Element Text']).toBe('Secret link');

      document.body.removeChild(container);
    });

    test('should not redact attributes when not specified in redaction list', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'other-attr');

      const element = document.createElement('button');
      element.setAttribute('id', 'test-id');
      element.setAttribute('class', 'test-class');
      element.setAttribute('aria-label', 'Test button');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('test-id');
      expect(result['[Amplitude] Element Class']).toBe('test-class');
      expect(result['[Amplitude] Element Aria Label']).toBe('Test button');

      document.body.removeChild(container);
    });

    test('should redact data attributes when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'user-name');

      const element = document.createElement('span');
      element.setAttribute('data-amp-track-user-name', 'John Doe');
      element.setAttribute('data-amp-track-user-id', '12345');
      element.textContent = 'User info';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Attributes']).toEqual({ 'user-id': '12345' });

      document.body.removeChild(container);
    });

    test('should never redact id or class attributes even when explicitly specified', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class, aria-label');

      const element = document.createElement('button');
      element.setAttribute('id', 'important-id');
      element.setAttribute('class', 'secret-class');
      element.setAttribute('aria-label', 'Secret label');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('important-id'); // ID should NEVER be redacted
      expect(result['[Amplitude] Element Class']).toBe('secret-class'); // Class should NEVER be redacted
      expect(result['[Amplitude] Element Aria Label']).toBeUndefined(); // Aria-label should be redacted

      document.body.removeChild(container);
    });
  });
});
