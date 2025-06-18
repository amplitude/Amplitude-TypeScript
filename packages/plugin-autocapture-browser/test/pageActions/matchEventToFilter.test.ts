import { EventSubpropKey } from './../../../analytics-core/src/types/element-interactions';
import type { Filter } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import { matchEventToFilter } from '../../src/pageActions/matchEventToFilter';
import { ElementBasedTimestampedEvent } from 'src/helpers';

// Helper to create a mock MouseEvent
const createMockMouseEvent = (): MouseEvent => {
  // In a browser environment, you could use `new MouseEvent('click')`
  // For Node.js testing environments (like Jest with JSDOM),
  // creating a full MouseEvent might be more involved or unnecessary
  // if only its presence is required.
  return {
    // Add any specific MouseEvent properties your function might access from `event.event`
  } as MouseEvent;
};

// Helper to create a base mock ElementBasedTimestampedEvent with real DOM elements
const createEventForTesting = (
  text: string | undefined,
  trackedElement: Element, // This will be the element the event is considered to have originated from
): ElementBasedTimestampedEvent<MouseEvent> => ({
  event: createMockMouseEvent(),
  type: 'click',
  timestamp: Date.now(),
  closestTrackedAncestor: trackedElement, // This is the element .closest() will be called on
  targetElementProperties: {
    '[Amplitude] Element Text': text,
  },
});

describe('matchEventToFilter', () => {
  let testContainer: HTMLDivElement;

  beforeEach(() => {
    // Create a container for test elements
    testContainer = document.createElement('div');
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Clean up the DOM
    document.body.removeChild(testContainer);
  });

  // --- Test Suite for '[Amplitude] Element Text' ---
  describe('when filter.subprop_key is "[Amplitude] Element Text"', () => {
    const textFilterKey = '[Amplitude] Element Text';
    let dummyElement: HTMLElement;

    beforeEach(() => {
      dummyElement = document.createElement('button'); // Any element will do
      testContainer.appendChild(dummyElement);
    });

    test('should return true if subprop_op is "exact" and text matches', () => {
      const event = createEventForTesting('Hello World', dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'exact',
        subprop_value: ['Hello World'],
      };
      expect(matchEventToFilter(event, filter)).toBe(true);
    });

    test('should return true if subprop_op is "exact" and text is one of the values', () => {
      const event = createEventForTesting('Click Here', dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'exact',
        subprop_value: ['Submit', 'Click Here', 'View More'],
      };
      expect(matchEventToFilter(event, filter)).toBe(true);
    });

    test('should return false if subprop_op is "exact" and text does not match', () => {
      const event = createEventForTesting('Goodbye World', dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'exact',
        subprop_value: ['Hello World'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    test('should return false if event text is undefined and looking for exact match', () => {
      const event = createEventForTesting(undefined, dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'exact',
        subprop_value: ['Hello World'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    // TODO: add tests for other operators
    test('should return false if subprop_op is not "exact" (due to other operators not implemented)', () => {
      const event = createEventForTesting('Hello World', dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'contains', // Any other operator
        subprop_value: ['Hello'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    test('should return false if subprop_value is an empty array for "exact" text match', () => {
      const event = createEventForTesting('Hello World', dummyElement);
      const filter: Filter = {
        subprop_key: textFilterKey,
        subprop_op: 'exact',
        subprop_value: [],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });
  });

  // --- Test Suite for '[Amplitude] Element Hierarchy' ---
  describe('when filter.subprop_key is "[Amplitude] Element Hierarchy"', () => {
    const hierarchyFilterKey = '[Amplitude] Element Hierarchy';

    test('should return true if subprop_op is "autotrack css match" and element matches CSS selector', () => {
      // DOM Structure: <div> <button class="my-button"></button> </div>
      const parentDiv = document.createElement('div');
      const button = document.createElement('button');
      button.className = 'my-button';
      parentDiv.appendChild(button);
      testContainer.appendChild(parentDiv);

      const event = createEventForTesting('Button Text', button); // Event on the button
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: ['div > .my-button'], // Selector targeting the button
      };
      expect(matchEventToFilter(event, filter)).toBe(true);
    });

    test('should return true if subprop_op is "autotrack css match" and a parent matches CSS selector', () => {
      // DOM Structure: <div id="container"> <button class="my-button"></button> </div>
      const parentDiv = document.createElement('div');
      parentDiv.id = 'container';
      const button = document.createElement('button');
      button.className = 'my-button';
      parentDiv.appendChild(button);
      testContainer.appendChild(parentDiv);

      const event = createEventForTesting('Button Text', button); // Event on the button
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: ['#container'], // Selector targeting the parent
      };
      // event.closestTrackedAncestor is 'button'. button.closest('#container') should be parentDiv
      expect(matchEventToFilter(event, filter)).toBe(true);
    });

    test('should return false if subprop_op is "autotrack css match" and element does not match CSS selector', () => {
      const button = document.createElement('button');
      button.className = 'another-button';
      testContainer.appendChild(button);

      const event = createEventForTesting('Button Text', button);
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: ['div > .my-button'], // This selector won't match the button
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    test('should return false if subprop_op is not "autotrack css match"', () => {
      const button = document.createElement('button');
      testContainer.appendChild(button);

      const event = createEventForTesting('Any text', button);
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'exact', // Any other operator
        subprop_value: ['div > .my-button'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    test('should use the first value in subprop_value for CSS selector', () => {
      const button = document.createElement('button');
      button.id = 'active-btn';
      testContainer.appendChild(button);

      const event = createEventForTesting('Any text', button);
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: ['#active-btn', '.ignored-selector'],
      };
      expect(matchEventToFilter(event, filter)).toBe(true);
    });

    test('should return false if subprop_value is an empty array for hierarchy match', () => {
      const button = document.createElement('button');
      testContainer.appendChild(button);
      const event = createEventForTesting('Any text', button);
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: [], // .toString() on this will be ""
      };
      // element.closest('') would typically return null or throw, depending on impl.
      // JSDOM's .closest('') returns null.
      expect(matchEventToFilter(event, filter)).toBe(false);
    });

    test('should return false if selector in subprop_value is invalid CSS', () => {
      const button = document.createElement('button');
      testContainer.appendChild(button);
      const event = createEventForTesting('Any text', button);
      const filter: Filter = {
        subprop_key: hierarchyFilterKey,
        subprop_op: 'autotrack css match',
        subprop_value: ['invalid>>><<<selector'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });
  });

  // --- Test Suite for unknown subprop_key ---
  describe('when filter.subprop_key is unknown', () => {
    test('should return false', () => {
      const dummyElement = document.createElement('div');
      testContainer.appendChild(dummyElement);
      const event = createEventForTesting('Some Text', dummyElement);
      const filter: Filter = {
        subprop_key: '[Amplitude] Unknown Key' as EventSubpropKey, // Intentionally unknown
        subprop_op: 'exact',
        subprop_value: ['Some Text'],
      };
      expect(matchEventToFilter(event, filter)).toBe(false);
    });
  });
});
