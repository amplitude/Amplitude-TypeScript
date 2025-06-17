import { ElementBasedTimestampedEvent } from './../../src/autocapture-plugin';
import type { LabeledEvent } from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import { groupLabeledEventIdsByEventType, matchEventToLabeledEvents } from '../../src/pageActions/triggers';
import * as matchEventToFilterModule from '../../src/pageActions/matchEventToFilter';

jest.mock('../../src/pageActions/matchEventToFilter');

describe('groupLabeledEventIdsByEventType', () => {
  // Test 1: Handles an empty array
  test('should return empty sets for an empty input array', () => {
    const labeledEvents: LabeledEvent[] = [];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click.size).toBe(0);
    expect(result.change.size).toBe(0);
  });

  // Test 2: Handles null or undefined input
  test('should return empty sets for null or undefined input', () => {
    let result = groupLabeledEventIdsByEventType(null);
    expect(result.click.size).toBe(0);
    expect(result.change.size).toBe(0);

    result = groupLabeledEventIdsByEventType(undefined);
    expect(result.click.size).toBe(0);
    expect(result.change.size).toBe(0);
  });

  // Test 3: Groups 'click' events correctly
  test('should group click event IDs correctly', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event1', definition: [{ event_type: 'click', filters: [] }] },
      {
        id: 'event2',
        definition: [
          {
            event_type: 'click',
            filters: [{ subprop_key: '[Amplitude] Element Text', subprop_op: 'exact', subprop_value: ['v'] }],
          },
        ],
      },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event1', 'event2']));
    expect(result.change.size).toBe(0);
  });

  // Test 4: Groups 'change' events correctly
  test('should group change event IDs correctly', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event3', definition: [{ event_type: 'change', filters: [] }] },
      { id: 'event4', definition: [{ event_type: 'change', filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.change).toEqual(new Set(['event3', 'event4']));
    expect(result.click.size).toBe(0);
  });

  // Test 5: Groups a mix of 'click' and 'change' events
  test('should group a mix of click and change event IDs', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event1', definition: [{ event_type: 'click', filters: [] }] },
      { id: 'event5', definition: [{ event_type: 'change', filters: [] }] },
      { id: 'event2', definition: [{ event_type: 'click', filters: [] }] },
      { id: 'event6', definition: [{ event_type: 'change', filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event1', 'event2']));
    expect(result.change).toEqual(new Set(['event5', 'event6']));
  });

  // Test 6: Handles multiple definitions (for different event_types) within a single LabeledEvent
  test('should handle multiple definitions in one LabeledEvent, adding ID to all relevant sets', () => {
    const labeledEvents: LabeledEvent[] = [
      {
        id: 'eventA',
        definition: [
          { event_type: 'click', filters: [] },
          { event_type: 'change', filters: [] },
        ],
      },
      {
        id: 'eventB', // Belongs only to click
        definition: [{ event_type: 'click', filters: [] }],
      },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['eventA', 'eventB']));
    expect(result.change).toEqual(new Set(['eventA']));
  });

  // Test 6b: Handles separate LabeledEvent items with the same ID but different event types
  test('should handle separate LabeledEvent items with the same ID for different types', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'eventC', definition: [{ event_type: 'click', filters: [] }] },
      { id: 'eventC', definition: [{ event_type: 'change', filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['eventC']));
    expect(result.change).toEqual(new Set(['eventC']));
  });

  // Test 7: Handles duplicate event IDs for the same event type (Set should ensure uniqueness)
  test('should handle duplicate event IDs for the same type, ensuring uniqueness', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event1', definition: [{ event_type: 'click', filters: [] }] },
      { id: 'event1', definition: [{ event_type: 'click', filters: [] }] }, // Processed, but ID is already in Set
      {
        id: 'event1', // Same ID, multiple definitions, one of which is click
        definition: [
          { event_type: 'change', filters: [] }, // This would add 'event1' to change set
          { event_type: 'click', filters: [] }, // This would attempt to add 'event1' to click set (no change if already there)
        ],
      },
      { id: 'event8', definition: [{ event_type: 'change', filters: [] }] },
      { id: 'event8', definition: [{ event_type: 'change', filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event1']));
    expect(result.change).toEqual(new Set(['event1', 'event8'])); // event1 from the third item
  });

  // Test 8: Ignores LabeledEvents with empty or missing/null definition arrays
  test('should ignore LabeledEvents with empty or malformed definition arrays', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event9', definition: [] }, // Empty definition array
      { id: 'event10' }, // Missing definition property
      { id: 'event10b', definition: null }, // Null definition property
      { id: 'event11', definition: [{ event_type: 'click', filters: [] }] },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event11']));
    expect(result.change.size).toBe(0);
  });

  // Test 9: Ignores definitions with event_types not 'click' or 'change' (or malformed event_type)
  test('should ignore definitions with unknown or malformed event_types', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event12', definition: [{ event_type: 'mouseover', filters: [] }] }, // 'mouseover' is not in groupedLabeledEvents
      { id: 'event13', definition: [{ event_type: 'click', filters: [] }] },
      {
        id: 'event14',
        definition: [
          { event_type: 'custom_event', filters: [] }, // Ignored
          { event_type: 'change', filters: [] }, // Processed
        ],
      },
      { id: 'event14b', definition: [{ event_type: null, filters: [] }] }, // Malformed event_type
      { id: 'event14c', definition: [{ filters: [] }] }, // Missing event_type
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event13']));
    expect(result.change).toEqual(new Set(['event14']));
  });

  // Test 10: Handles LabeledEvents with definition items that are null or malformed
  test('should handle LabeledEvents with null or malformed definition items', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event15', definition: [null, { event_type: 'click', filters: [] }] }, // Null item in definition array
      { id: 'event16', definition: [{ event_type: 'change', filters: [] }, {}] }, // Empty object as definition item
      { id: 'event17', definition: [{ event_type: 'click', filters: [] }] },
      { id: 'event18', definition: [undefined, { event_type: 'change', filters: [] }] }, // Undefined item
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event17']));
    expect(result.change).toEqual(new Set(['event16']));
  });

  // Test 11: Handles LabeledEvent items that are null or not objects within the input array
  test('should gracefully handle null or non-object items in labeledEvents array', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'c1', definition: [{ event_type: 'click', filters: [] }] },
      null, // Null item in labeledEvents
      { id: 'ch1', definition: [{ event_type: 'change', filters: [] }] },
      'not_an_object', // String item in labeledEvents
      undefined, // Undefined item
      { id: 'c2', definition: [{ event_type: 'click', filters: [] }] },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['c1', 'c2']));
    expect(result.change).toEqual(new Set(['ch1']));
  });

  // Test 12: Complex scenario with mixed valid, invalid, and duplicate data
  test('should handle a complex mix of data correctly', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'c1', definition: [{ event_type: 'click', filters: [] }] },
      null,
      { id: 'ch1', definition: [{ event_type: 'change', filters: [] }] },
      {
        id: 'c2',
        definition: [
          { event_type: 'click', filters: [] },
          { event_type: 'focus', filters: [] },
        ],
      },
      { id: 'ch1', definition: [{ event_type: 'change', filters: [] }] }, // Duplicate ID for change
      {
        id: 'multi1',
        definition: [
          { event_type: 'click', filters: [] },
          { event_type: 'change', filters: [] },
        ],
      },
      { id: 'eventWithoutDef' }, // Missing definition
      { id: 'eventWithEmptyDef', definition: [] }, // Empty definition array
      { id: 'eventWithNullDefItem', definition: [null, { event_type: 'click', filters: [] }] },
      { id: 'eventWithInvalidDefObj', definition: [{ some_other_prop: 'value' }] }, // Missing event_type
      { id: 'eventWithOnlyChange', definition: [{ event_type: 'change', filters: [] }] },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['c1', 'c2', 'multi1']));
    expect(result.change).toEqual(new Set(['ch1', 'multi1', 'eventWithOnlyChange']));
  });
});

describe('matchEventToLabeledEvents', () => {
  let spy: jest.SpyInstance;
  beforeAll(() => {
    spy = jest.spyOn(matchEventToFilterModule, 'matchEventToFilter');
  });
  beforeEach(() => {
    // Clear mock calls before each test
    spy.mockClear();
  });

  const mockMouseEvent = new MouseEvent('click');

  const mockEvent: ElementBasedTimestampedEvent<MouseEvent> = {
    event: mockMouseEvent,
    type: 'click',
    closestTrackedAncestor: document.createElement('div'),
    targetElementProperties: {},
    timestamp: 0, // Add timestamp to satisfy BaseTimestampedEvent
  };

  it('should return an empty array if no labeled events match', () => {
    spy.mockReturnValue(false); // Simulate no filter matches
    const labeledEvents: LabeledEvent[] = [
      {
        id: '1',
        definition: [
          {
            event_type: 'click',
            filters: [
              {
                subprop_key: '[Amplitude] Element Text',
                subprop_op: 'exact',
                subprop_value: ['Button A'],
              },
            ],
          },
        ],
      },
    ];

    const result = matchEventToLabeledEvents(mockEvent, labeledEvents);
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should return a single matching labeled event', () => {
    spy.mockReturnValue(true); // Simulate all filters match

    const labeledEvents: LabeledEvent[] = [
      {
        id: '2',
        definition: [
          {
            event_type: 'click',
            filters: [
              {
                subprop_key: '[Amplitude] Element Hierarchy',
                subprop_op: 'contains',
                subprop_value: ['div > span'],
              },
            ],
          },
        ],
      },
      {
        id: '3',
        definition: [
          {
            event_type: 'change',
            filters: [
              {
                subprop_key: '[Amplitude] Element Text',
                subprop_op: 'is',
                subprop_value: ['Input Field'],
              },
            ],
          },
        ],
      },
    ];

    const result = matchEventToLabeledEvents(mockEvent, labeledEvents);
    expect(result).toEqual([labeledEvents[0]]);
    expect(spy).toHaveBeenCalledTimes(1); // Only for the first labeled event's first filter
  });

  it('should return multiple matching labeled events', () => {
    spy.mockReturnValue(true); // Simulate all filters match

    const labeledEvents: LabeledEvent[] = [
      {
        id: '4',
        definition: [
          {
            event_type: 'click',
            filters: [
              {
                subprop_key: '[Amplitude] Element Text',
                subprop_op: 'is',
                subprop_value: ['Link 1'],
              },
            ],
          },
        ],
      },
      {
        id: '5',
        definition: [
          {
            event_type: 'click',
            filters: [
              {
                subprop_key: '[Amplitude] Element Hierarchy',
                subprop_op: 'contains',
                subprop_value: ['a.some-class'],
              },
            ],
          },
        ],
      },
      {
        id: '6',
        definition: [
          {
            event_type: 'change',
            filters: [
              {
                subprop_key: '[Amplitude] Element Text',
                subprop_op: 'is',
                subprop_value: ['Dropdown'],
              },
            ],
          },
        ],
      },
    ];

    const result = matchEventToLabeledEvents(mockEvent, labeledEvents);
    expect(result).toEqual([labeledEvents[0], labeledEvents[1]]);
    expect(spy).toHaveBeenCalledTimes(2); // For the first two labeled events
  });

  it('should match if one of multiple definitions matches', () => {
    const labeledEvent: LabeledEvent = {
      id: '7',
      definition: [
        {
          event_type: 'click', // This definition will not match `mockEvent.type`
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Some other text'],
            },
          ],
        },
        {
          event_type: 'click', // This definition will match
          filters: [
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'starts_with',
              subprop_value: ['body > div'],
            },
          ],
        },
      ],
    };

    // First filter of the first definition will return false
    spy.mockReturnValueOnce(false);
    // First filter of the second definition will return true
    spy.mockReturnValueOnce(true);

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([labeledEvent]);
    // It should be called for the first filter of the first definition,
    // and then for the first filter of the second definition.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should not match if all definitions do not match', () => {
    const labeledEvent: LabeledEvent = {
      id: '8',
      definition: [
        {
          event_type: 'click',
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Text 1'],
            },
          ],
        },
        {
          event_type: 'click',
          filters: [
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'contains',
              subprop_value: ['path2'],
            },
          ],
        },
      ],
    };

    spy.mockReturnValue(false);

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2); // Called for both filters of the two definitions
  });

  it('should match if all filters within a definition match', () => {
    const labeledEvent: LabeledEvent = {
      id: '9',
      definition: [
        {
          event_type: 'click',
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Primary Button'],
            },
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'ends_with',
              subprop_value: ['button'],
            },
          ],
        },
      ],
    };

    spy.mockReturnValue(true); // Both filters will return true

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([labeledEvent]);
    expect(spy).toHaveBeenCalledTimes(2); // Called for both filters
  });

  it('should not match if any filter within a definition does not match', () => {
    const labeledEvent: LabeledEvent = {
      id: '10',
      definition: [
        {
          event_type: 'click',
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Matching Text'],
            },
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'ends_with',
              subprop_value: ['non-matching-path'],
            },
          ],
        },
      ],
    };

    // First filter returns true, second returns false
    spy.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(2); // Called for both filters until one fails
  });

  it('should handle an empty filters array within a definition (should match by default)', () => {
    // If there are no filters, `every` will return true, so it should match
    const labeledEvent: LabeledEvent = {
      id: '11',
      definition: [
        {
          event_type: 'click',
          filters: [], // Empty filters array
        },
      ],
    };

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([labeledEvent]);
    expect(spy).not.toHaveBeenCalled(); // No filters to check
  });

  it('should handle empty definition array for a labeled event', () => {
    const labeledEvent: LabeledEvent = {
      id: '12',
      definition: [], // Empty definition array
    };

    const result = matchEventToLabeledEvents(mockEvent, [labeledEvent]);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should return an empty array if labeledEvents is empty', () => {
    const result = matchEventToLabeledEvents(mockEvent, []);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
