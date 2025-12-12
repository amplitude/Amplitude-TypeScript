import { DataExtractor } from '../src/data-extractor';
import * as constants from '../src/constants';
import { mockWindowLocationFromURL } from './utils';
import type { ElementBasedTimestampedEvent } from '../src/helpers';
import { DATA_AMP_MASK_ATTRIBUTES } from '../src/constants';
import * as hierarchy from '../src/hierarchy';
import type { Hierarchy } from '../src/typings/autocapture';
import { MASKED_TEXT_VALUE } from '@amplitude/analytics-core';

describe('data extractor', () => {
  let dataExtractor: DataExtractor;

  beforeEach(() => {
    dataExtractor = new DataExtractor({ maskTextRegex: [/Florida|California/, /Pennsylvania/] });
  });

  describe('constructor - maskTextRegex pattern compilation', () => {
    test('should compile valid pattern strings from pattern objects', () => {
      const extractor = new DataExtractor({
        maskTextRegex: [{ pattern: 'Texas|Nevada', description: 'US States' }],
      });

      const button = document.createElement('button');
      button.textContent = 'Visit Texas today';
      const result = extractor.getText(button);

      expect(result).toEqual(`Visit ${MASKED_TEXT_VALUE} today`);
    });

    test('should ignore invalid regex pattern strings without throwing', () => {
      // Invalid regex patterns with unclosed brackets, invalid escapes, etc.
      expect(() => {
        new DataExtractor({
          maskTextRegex: [
            { pattern: '[invalid(regex', description: 'Invalid pattern 1' },
            { pattern: '(?:unclosed', description: 'Invalid pattern 2' },
            { pattern: '\\k<invalid>', description: 'Invalid pattern 3' },
          ],
        });
      }).not.toThrow();
    });

    test('should continue processing valid patterns after encountering invalid ones', () => {
      const extractor = new DataExtractor({
        maskTextRegex: [
          { pattern: '[invalid(', description: 'Invalid' },
          { pattern: 'Secret', description: 'Valid' },
          /Confidential/,
        ],
      });

      const button1 = document.createElement('button');
      button1.textContent = 'Secret information';
      const result1 = extractor.getText(button1);
      expect(result1).toEqual(`${MASKED_TEXT_VALUE} information`);

      const button2 = document.createElement('button');
      button2.textContent = 'Confidential data';
      const result2 = extractor.getText(button2);
      expect(result2).toEqual(`${MASKED_TEXT_VALUE} data`);
    });

    test('should handle mixed RegExp and pattern objects', () => {
      const extractor = new DataExtractor({
        maskTextRegex: [/DirectRegex/, { pattern: 'PatternObject', description: 'Pattern as object' }],
      });

      const button1 = document.createElement('button');
      button1.textContent = 'DirectRegex test';
      expect(extractor.getText(button1)).toEqual(`${MASKED_TEXT_VALUE} test`);

      const button2 = document.createElement('button');
      button2.textContent = 'PatternObject test';
      expect(extractor.getText(button2)).toEqual(`${MASKED_TEXT_VALUE} test`);
    });

    test('should compile patterns with case-insensitive flag', () => {
      const extractor = new DataExtractor({
        maskTextRegex: [{ pattern: 'sensitive', description: 'Case insensitive' }],
      });

      const button1 = document.createElement('button');
      button1.textContent = 'SENSITIVE data';
      expect(extractor.getText(button1)).toEqual(`${MASKED_TEXT_VALUE} data`);

      const button2 = document.createElement('button');
      button2.textContent = 'Sensitive data';
      expect(extractor.getText(button2)).toEqual(`${MASKED_TEXT_VALUE} data`);

      const button3 = document.createElement('button');
      button3.textContent = 'sensitive data';
      expect(extractor.getText(button3)).toEqual(`${MASKED_TEXT_VALUE} data`);
    });

    test('should respect MAX_MASK_TEXT_PATTERNS limit', () => {
      const maxPatterns = constants.MAX_MASK_TEXT_PATTERNS;
      const patterns = Array.from({ length: maxPatterns + 5 }, (_, i) => ({
        pattern: `word${i}\\b`,
        description: `Pattern ${i}`,
      }));

      const extractor = new DataExtractor({
        maskTextRegex: patterns,
      });

      // The first maxPatterns should work
      const button1 = document.createElement('button');
      button1.textContent = `word${maxPatterns - 1} test`;
      expect(extractor.getText(button1)).toEqual(`${MASKED_TEXT_VALUE} test`);

      // Patterns beyond the limit should not be compiled
      const button2 = document.createElement('button');
      button2.textContent = `word${maxPatterns} test`;
      expect(extractor.getText(button2)).toEqual(`word${maxPatterns} test`);
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
      expect(result).toEqual(`submit${MASKED_TEXT_VALUE}`);
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
      expect(result).toEqual(MASKED_TEXT_VALUE);
    });

    test('should return MASKED_TEXT_VALUE when parent element has data-amp-mask attribute', () => {
      const container = document.createElement('div');
      container.setAttribute('data-amp-mask', 'true');
      const button = document.createElement('button');
      button.innerText = 'button text';
      container.appendChild(button);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(MASKED_TEXT_VALUE);
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
      expect(result).toEqual(MASKED_TEXT_VALUE);
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
      expect(result).toEqual(`Pay with card ${MASKED_TEXT_VALUE} securely`);
    });

    test('should mask sensitive text content containing SSN', () => {
      const button = document.createElement('button');
      const safeText = document.createTextNode('Submit form ');
      button.appendChild(safeText);
      const sensitiveDiv = document.createElement('div');
      sensitiveDiv.innerText = '269-28-9315'; // SSN
      button.appendChild(sensitiveDiv);
      const result = dataExtractor.getText(button);
      expect(result).toEqual(`Submit form ${MASKED_TEXT_VALUE}`);
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
      expect(result).toEqual(`Contact ${MASKED_TEXT_VALUE} for support`);
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
      expect(result).toEqual(`Welcome to ${MASKED_TEXT_VALUE} tourism`);
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
      expect(maskedResult).toEqual(MASKED_TEXT_VALUE);

      // Test container with mixed content - masked elements return MASKED_TEXT_VALUE, sensitive text is also masked
      const containerResult = dataExtractor.getText(container);
      expect(containerResult).toEqual(`Normal text ${MASKED_TEXT_VALUE}${MASKED_TEXT_VALUE}`);
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
      expect(result).toEqual(MASKED_TEXT_VALUE);
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

  describe('getEventProperties with maskion', () => {
    test('should NOT mask id or class when both specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class');

      const element = document.createElement('button');
      element.setAttribute('id', 'secret-id');
      element.setAttribute('class', 'secret-class');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('secret-id'); // ID should NOT be masked
      expect(result['[Amplitude] Element Class']).toBe('secret-class'); // Class should NOT be masked
      expect(result['[Amplitude] Element Tag']).toBe('button');
      expect(result['[Amplitude] Element Text']).toBe('Click me');

      document.body.removeChild(container);
    });

    test('should mask attributes when mask rule is on element itself but never mask id or class', () => {
      const element = document.createElement('button');
      element.setAttribute('id', 'test-id');
      element.setAttribute('class', 'test-class');
      element.setAttribute('aria-label', 'Test button');
      element.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'id, class, aria-label'); // On element itself
      element.textContent = 'Click me';

      document.body.appendChild(element);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element ID']).toBe('test-id'); // ID should NEVER be masked
      expect(result['[Amplitude] Element Class']).toBe('test-class'); // Class should NEVER be masked
      expect(result['[Amplitude] Element Aria Label']).toBe(MASKED_TEXT_VALUE);

      document.body.removeChild(element);
    });

    test('should mask aria-label when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'aria-label');

      const element = document.createElement('button');
      element.setAttribute('aria-label', 'Secret button label');
      element.textContent = 'Click me';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Aria Label']).toBe(MASKED_TEXT_VALUE);
      expect(result['[Amplitude] Element Text']).toBe('Click me');

      document.body.removeChild(container);
    });

    test('should not mask href for anchor elements when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'href');

      const element = document.createElement('a');
      element.setAttribute('href', 'https://secret-url.com');
      element.textContent = 'Secret link';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Href']).toBe('https://secret-url.com/');
      expect(result['[Amplitude] Element Text']).toBe('Secret link');

      document.body.removeChild(container);
    });

    test('should truncate href when it exceeds MAX_ATTRIBUTE_LENGTH', () => {
      const container = document.createElement('div');

      const element = document.createElement('a');
      // Create a very large href value (simulating a data URI or long URL)
      const largeHref = 'data:image/png;base64,' + 'A'.repeat(5000);
      element.setAttribute('href', largeHref);
      element.textContent = 'Large data link';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      const hrefValue = result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HREF];
      expect((hrefValue as string).length).toBe(constants.MAX_ATTRIBUTE_LENGTH);
      expect(largeHref.startsWith(hrefValue as string)).toBe(true);

      document.body.removeChild(container);
    });

    test('should not mask attributes when not specified in maskion list', () => {
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

    test('should mask data attributes when specified on parent', () => {
      const container = document.createElement('div');
      container.setAttribute(DATA_AMP_MASK_ATTRIBUTES, 'data-amp-track-user-name');

      const element = document.createElement('span');
      element.setAttribute('data-amp-track-user-id', '12345');
      element.setAttribute('data-amp-track-user-name', 'John Doe');
      element.textContent = 'User info';

      container.appendChild(element);
      document.body.appendChild(container);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result['[Amplitude] Element Attributes']).toEqual({ 'user-id': '12345', 'user-name': MASKED_TEXT_VALUE });

      document.body.removeChild(container);
    });

    test('should never mask id or class attributes even when explicitly specified', () => {
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

      expect(result['[Amplitude] Element ID']).toBe('important-id'); // ID should NEVER be masked
      expect(result['[Amplitude] Element Class']).toBe('secret-class'); // Class should NEVER be masked
      expect(result['[Amplitude] Element Aria Label']).toBe(MASKED_TEXT_VALUE); // Aria-label should be masked

      document.body.removeChild(container);
    });
  });

  describe('getHierarchy', () => {
    test('should return a list starting from the target element', () => {
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent2">
          <div id="parent1">
            <div id="inner">
              xxx
            </div>
            <div id="inner2">
              xxx
            </div>
          </div>
        </div>
      `;

      const inner2 = document.getElementById('inner2');

      expect(dataExtractor.getHierarchy(inner2)).toEqual([
        {
          id: 'inner2',
          index: 1,
          indexOfType: 1,
          prevSib: 'div',
          tag: 'div',
        },
        {
          id: 'parent1',
          index: 0,
          indexOfType: 0,
          tag: 'div',
        },
        {
          id: 'parent2',
          index: 0,
          indexOfType: 0,
          tag: 'div',
        },
        {
          index: 1,
          indexOfType: 0,
          prevSib: 'head',
          tag: 'body',
        },
      ]);
    });

    test('should not fail when element is null', () => {
      const nullElement = null;
      expect(dataExtractor.getHierarchy(nullElement)).toEqual([]);
    });

    test('should handle null elements in hierarchy when getElementProperties returns null', () => {
      // Create a valid element
      const element = document.createElement('div');
      element.id = 'test-element';
      document.body.appendChild(element);

      // Mock getAncestors to return an array with a null element
      const getAncestorsSpy = jest
        .spyOn(hierarchy, 'getAncestors')
        .mockReturnValue([element, null as unknown as Element]);

      // getHierarchy should include null results from getElementProperties
      const hierarchyResult = dataExtractor.getHierarchy(element);

      // Verify that the first element is properly formed and the second is null
      expect(hierarchyResult).toHaveLength(2);
      expect(hierarchyResult[0]).toHaveProperty('id', 'test-element');
      expect(hierarchyResult[0]).toHaveProperty('tag', 'div');
      expect(hierarchyResult[0]).toHaveProperty('index');
      expect(hierarchyResult[0]).toHaveProperty('indexOfType');
      expect(hierarchyResult[1]).toBeNull();

      // Restore original function
      getAncestorsSpy.mockRestore();
      document.body.removeChild(element);
    });

    test('should handle currentElementAttributes when hierarchy[0] is null or undefined', () => {
      // Create a test element
      const element = document.createElement('div');
      element.id = 'test-element';
      element.setAttribute('data-test', 'value');
      document.body.appendChild(element);

      // Mock getHierarchy to return an array with null/undefined at index 0
      const originalGetHierarchy = dataExtractor.getHierarchy;
      jest.spyOn(dataExtractor, 'getHierarchy').mockReturnValue([null, undefined] as Hierarchy);

      // Call getEventProperties which uses hierarchy[0]?.attrs on line 145
      const result = dataExtractor.getEventProperties('click', element, 'data-');

      // Verify that currentElementAttributes is undefined when hierarchy[0] is null
      // This should not cause an error due to the optional chaining (?.) and nullish coalescing (??)
      expect(result).toBeDefined();

      // The ELEMENT_ATTRIBUTES property should be undefined because removeEmptyProperties
      // removes empty objects, and extractPrefixedAttributes({}, 'data-') returns {}
      expect(result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ATTRIBUTES]).toBeUndefined();
      expect(result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_HIERARCHY]).toEqual([null, undefined]);

      // Verify that the method handles the null/undefined hierarchy gracefully
      expect(result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_TAG]).toBe('div');
      expect(result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ID]).toBe('test-element');

      // The aria-label should also be undefined since currentElementAttributes is undefined
      expect(result[constants.AMPLITUDE_EVENT_PROP_ELEMENT_ARIA_LABEL]).toBeUndefined();

      // Restore original method and clean up
      dataExtractor.getHierarchy = originalGetHierarchy;
      document.body.removeChild(element);
    });

    describe('[Amplitude] Element Hierarchy property:', () => {
      test('should cut off hierarchy output nodes to stay less than or equal to 1024 chars', () => {
        document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent2">
          <div id="parent1"
            long-attribute="${'a'.repeat(2000)}end"
            long-attribute2="${'a'.repeat(128)}"
            long-attribute3="${'a'.repeat(128)}"
            long-attribute4="${'a'.repeat(128)}"
            long-attribute5="${'a'.repeat(128)}"
            attribute6="${'a'.repeat(8)}"
          >
            <div id="inner12345">
              xxx
            </div>
          </div>
        </div>
      `;

        const inner12345 = document.getElementById('inner12345');
        const innerHierarchy = dataExtractor.getHierarchy(inner12345);
        // expect innerHierarchy to not have body to stay under 1024 chars
        expect(innerHierarchy).toEqual([
          {
            id: 'inner12345',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            id: 'parent1',
            index: 0,
            indexOfType: 0,
            tag: 'div',
            attrs: {
              'long-attribute': 'a'.repeat(128),
              'long-attribute2': 'a'.repeat(128),
              'long-attribute3': 'a'.repeat(128),
              'long-attribute4': 'a'.repeat(128),
              'long-attribute5': 'a'.repeat(128),
              attribute6: 'a'.repeat(8),
            },
          },
          {
            id: 'parent2',
            index: 0,
            indexOfType: 0,
            tag: 'div',
          },
          {
            index: 1,
            indexOfType: 0,
            prevSib: 'head',
            tag: 'body',
          },
        ]);
        const resultLength = JSON.stringify(innerHierarchy).length;
        expect(resultLength).toBeLessThanOrEqual(1024);
        expect(resultLength).toEqual(1005);
      });
    });

    describe('attribute maskion', () => {
      test(`should mask attributes specified in ${DATA_AMP_MASK_ATTRIBUTES} on target element`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="parent">
            <div id="target" ${DATA_AMP_MASK_ATTRIBUTES}="custom-attr,secret-data" custom-attr="should-be-masked" secret-data="hidden" visible-attr="should-remain">
              content
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            'visible-attr': 'should-remain',
            'custom-attr': MASKED_TEXT_VALUE,
            'secret-data': MASKED_TEXT_VALUE,
          },
        });
      });

      test(`should mask attributes from child elements when specified in parent ${DATA_AMP_MASK_ATTRIBUTES}`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="parent" ${DATA_AMP_MASK_ATTRIBUTES}="sensitive-attr">
            <div id="target" sensitive-attr="should-be-masked" normal-attr="should-remain">
              content
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        // Target element should have sensitive-attr masked
        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            'normal-attr': 'should-remain',
            'sensitive-attr': MASKED_TEXT_VALUE,
          },
        });

        // Parent element should keep DATA_AMP_MASK_ATTRIBUTES
        expect(hierarchy[1]).toEqual({
          id: 'parent',
          index: 0,
          indexOfType: 0,
          tag: 'div',
        });
      });

      test(`should accumulate masked attributes from multiple ancestors`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="grandparent" ${DATA_AMP_MASK_ATTRIBUTES}="attr1,attr2">
            <div id="parent" ${DATA_AMP_MASK_ATTRIBUTES}="attr3">
              <div id="target" attr1="mask1" attr2="mask2" attr3="mask3" normal-attr="keep">
                content
              </div>
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        // Target should have all specified attributes masked
        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            attr1: MASKED_TEXT_VALUE,
            attr2: MASKED_TEXT_VALUE,
            attr3: MASKED_TEXT_VALUE,
            'normal-attr': 'keep',
          },
        });
      });

      test(`should not mask id and class attributes even if specified in ${DATA_AMP_MASK_ATTRIBUTES}`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="parent" ${DATA_AMP_MASK_ATTRIBUTES}="id,class,custom-attr">
            <div id="target" class="test-class" custom-attr="should-be-masked">
              content
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        // Target should keep id and class but mask custom-attr
        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          classes: ['test-class'],
          attrs: {
            'custom-attr': MASKED_TEXT_VALUE,
          },
        });
      });

      test(`should handle empty ${DATA_AMP_MASK_ATTRIBUTES} gracefully`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="parent" ${DATA_AMP_MASK_ATTRIBUTES}="">
            <div id="target" custom-attr="should-remain">
              content
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            'custom-attr': 'should-remain',
          },
        });
      });

      test(`should handle whitespace and malformed attribute lists in ${DATA_AMP_MASK_ATTRIBUTES}`, () => {
        document.getElementsByTagName('body')[0].innerHTML = `
          <div id="parent" ${DATA_AMP_MASK_ATTRIBUTES}=" attr1 , , attr2 , ">
            <div id="target" attr1="mask1" attr2="mask2" attr3="keep">
              content
            </div>
          </div>
        `;

        const target = document.getElementById('target');
        const hierarchy = dataExtractor.getHierarchy(target);

        expect(hierarchy[0]).toEqual({
          id: 'target',
          index: 0,
          indexOfType: 0,
          tag: 'div',
          attrs: {
            attr1: MASKED_TEXT_VALUE,
            attr2: MASKED_TEXT_VALUE,
            attr3: 'keep',
          },
        });
      });
    });

    test('should record histogram with diagnostics client when provided', () => {
      const mockDiagnosticsClient = {
        recordHistogram: jest.fn(),
        setTag: jest.fn(),
        increment: jest.fn(),
        recordEvent: jest.fn(),
        _flush: jest.fn(),
        _setSampleRate: jest.fn(),
      };

      // Create a new data extractor with diagnostics client
      const dataExtractorWithDiagnostics = new DataExtractor(
        {
          maskTextRegex: [/Florida|California/, /Pennsylvania/],
        },
        {
          diagnosticsClient: mockDiagnosticsClient,
        },
      );

      // Set up DOM
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent">
          <div id="child">
            <button id="target">Click me</button>
          </div>
        </div>
      `;

      const target = document.getElementById('target');
      dataExtractorWithDiagnostics.getHierarchy(target);

      // Verify that recordHistogram was called with the correct metric name
      expect(mockDiagnosticsClient.recordHistogram).toHaveBeenCalledWith(
        'autocapturePlugin.getHierarchy',
        expect.any(Number),
      );

      // Verify that the recorded value is a positive number (execution time)
      // eslint-disable-next-line
      const recordedValue = mockDiagnosticsClient.recordHistogram.mock.calls[0][1];
      expect(recordedValue).toBeGreaterThanOrEqual(0);
    });

    test('should not call diagnostics client when not provided', () => {
      // Create a new data extractor without diagnostics client
      const dataExtractorWithoutDiagnostics = new DataExtractor({
        maskTextRegex: [/Florida|California/, /Pennsylvania/],
      });
      // Ensure diagnosticsClient is undefined
      expect(dataExtractor.diagnosticsClient).toBeUndefined();

      // Set up DOM
      document.getElementsByTagName('body')[0].innerHTML = `
        <div id="parent">
          <div id="child">
            <button id="target">Click me</button>
          </div>
        </div>
      `;

      const target = document.getElementById('target');

      // This should not throw an error even when diagnosticsClient is undefined
      expect(() => {
        dataExtractorWithoutDiagnostics.getHierarchy(target);
      }).not.toThrow();
    });
  });

  describe('getEventProperties with title masking', () => {
    beforeEach(() => {
      // Mock window.location
      mockWindowLocationFromURL(new URL('https://test.com'));
      // Mock document.title
      Object.defineProperty(document, 'title', {
        value: 'Test Page Title',
        writable: true,
      });
      // Mock window.innerHeight and innerWidth
      Object.defineProperty(window, 'innerHeight', { value: 800 });
      Object.defineProperty(window, 'innerWidth', { value: 1200 });
    });

    afterEach(() => {
      // Clean up any title elements added during tests
      const titleElements = document.querySelectorAll('title');
      titleElements.forEach((el) => el.remove());
    });

    test('should include masked page title when title element has data-amp-mask', () => {
      // Create and add title element with data-amp-mask
      const titleElement = document.createElement('title');
      titleElement.setAttribute('data-amp-mask', 'true');
      titleElement.textContent = 'Sensitive Page Title';
      document.head.appendChild(titleElement);

      const element = document.createElement('button');
      element.textContent = 'Click me';
      document.body.appendChild(element);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result[constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]).toBe(MASKED_TEXT_VALUE);

      document.body.removeChild(element);
    });

    test('should include normal page title when title element does not have data-amp-mask', () => {
      const element = document.createElement('button');
      element.textContent = 'Click me';
      document.body.appendChild(element);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result[constants.AMPLITUDE_EVENT_PROP_PAGE_TITLE]).toBe('Test Page Title');

      document.body.removeChild(element);
    });
  });

  describe('getEventProperties with page URL', () => {
    test('should escape special characters in page URL', () => {
      mockWindowLocationFromURL(new URL('https://www.topps.com/products/2025-bowman-chrome%C2%AE-baseball-mega-box'));
      const element = document.createElement('button');
      element.textContent = 'Click me';
      document.body.appendChild(element);

      const result = dataExtractor.getEventProperties('click', element, 'data-amp-track-');

      expect(result[constants.AMPLITUDE_EVENT_PROP_PAGE_URL]).toBe(
        'https://www.topps.com/products/2025-bowman-chrome®-baseball-mega-box',
      );

      document.body.removeChild(element);
    });
  });
});
