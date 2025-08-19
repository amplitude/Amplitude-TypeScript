import { mockWindowLocationFromURL } from './../utils';
import type { ElementBasedTimestampedEvent } from '../../src/helpers';
import type {
  LabeledEvent,
  Trigger,
  ElementInteractionsOptions,
} from '@amplitude/analytics-core/lib/esm/types/element-interactions';
import {
  groupLabeledEventIdsByEventType,
  matchEventToLabeledEvents,
  createLabeledEventToTriggerMap,
  createTriggerEvaluator,
} from '../../src/pageActions/triggers';
import * as matchEventToFilterModule from '../../src/pageActions/matchEventToFilter';
import * as actionsModule from '../../src/pageActions/actions';
import { AMPLITUDE_ELEMENT_CLICKED_EVENT, AMPLITUDE_ELEMENT_CHANGED_EVENT } from '../../src/constants';
import { autocapturePlugin } from '../../src/autocapture-plugin';
import type { BrowserClient, BrowserConfig, EnrichmentPlugin, ILogger } from '@amplitude/analytics-core';
import { createInstance } from '@amplitude/analytics-browser';
import { createRemoteConfigFetch } from '@amplitude/analytics-remote-config';
import * as triggersModule from '../../src/pageActions/triggers';
import { DataExtractor } from '../../src/data-extractor';

/* eslint-disable @typescript-eslint/unbound-method */

jest.mock('../../src/pageActions/matchEventToFilter');
jest.mock('../../src/pageActions/actions');

// Mock the remote config fetch
jest.mock('@amplitude/analytics-remote-config', () => ({
  createRemoteConfigFetch: jest.fn(),
}));

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
      { id: 'event1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      {
        id: 'event2',
        definition: [
          {
            event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
            filters: [{ subprop_key: '[Amplitude] Element Text', subprop_op: 'is', subprop_value: ['v'] }],
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
      { id: 'event3', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      { id: 'event4', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.change).toEqual(new Set(['event3', 'event4']));
    expect(result.click.size).toBe(0);
  });

  // Test 5: Groups a mix of 'click' and 'change' events
  test('should group a mix of click and change event IDs', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'event5', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      { id: 'event2', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'event6', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
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
          { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] },
          { event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] },
        ],
      },
      {
        id: 'eventB', // Belongs only to click
        definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }],
      },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['eventA', 'eventB']));
    expect(result.change).toEqual(new Set(['eventA']));
  });

  // Test 6b: Handles separate LabeledEvent items with the same ID but different event types
  test('should handle separate LabeledEvent items with the same ID for different types', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'eventC', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'eventC', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['eventC']));
    expect(result.change).toEqual(new Set(['eventC']));
  });

  // Test 7: Handles duplicate event IDs for the same event type (Set should ensure uniqueness)
  test('should handle duplicate event IDs for the same type, ensuring uniqueness', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'event1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] }, // Processed, but ID is already in Set
      {
        id: 'event1', // Same ID, multiple definitions, one of which is click
        definition: [
          { event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }, // This would add 'event1' to change set
          { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }, // This would attempt to add 'event1' to click set (no change if already there)
        ],
      },
      { id: 'event8', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      { id: 'event8', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
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
      { id: 'event11', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event11']));
    expect(result.change.size).toBe(0);
  });

  // Test 9: Ignores definitions with event_types not 'click' or 'change' (or malformed event_type)
  test('should ignore definitions with unknown or malformed event_types', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'event12', definition: [{ event_type: 'mouseover', filters: [] }] }, // 'mouseover' is not in groupedLabeledEvents
      { id: 'event13', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      {
        id: 'event14',
        definition: [
          { event_type: 'custom_event', filters: [] }, // Ignored
          { event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }, // Processed
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
      { id: 'event15', definition: [null, { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] }, // Null item in definition array
      { id: 'event16', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }, {}] }, // Empty object as definition item
      { id: 'event17', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'event18', definition: [undefined, { event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] }, // Undefined item
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['event17']));
    expect(result.change).toEqual(new Set(['event16']));
  });

  // Test 11: Handles LabeledEvent items that are null or not objects within the input array
  test('should gracefully handle null or non-object items in labeledEvents array', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'c1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      null, // Null item in labeledEvents
      { id: 'ch1', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      'not_an_object', // String item in labeledEvents
      undefined, // Undefined item
      { id: 'c2', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
    ] as LabeledEvent[];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['c1', 'c2']));
    expect(result.change).toEqual(new Set(['ch1']));
  });

  // Test 12: Should ignore unknown Amplitude event types
  test('should ignore unknown Amplitude event types like "[Amplitude] Random Event"', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'validClick', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'validChange', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      {
        id: 'randomEvent',
        definition: [
          { event_type: '[Amplitude] Random Event' as unknown as typeof AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] },
        ],
      },
      {
        id: 'mixedEvent',
        definition: [
          { event_type: '[Amplitude] Unknown Event' as unknown as typeof AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }, // Should be ignored
          { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }, // Should be processed
        ],
      },
    ];
    const result = groupLabeledEventIdsByEventType(labeledEvents);
    expect(result.click).toEqual(new Set(['validClick', 'mixedEvent']));
    expect(result.change).toEqual(new Set(['validChange']));
  });

  // Test 13: Complex scenario with mixed valid, invalid, and duplicate data
  test('should handle a complex mix of data correctly', () => {
    const labeledEvents: LabeledEvent[] = [
      { id: 'c1', definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      null,
      { id: 'ch1', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
      {
        id: 'c2',
        definition: [
          { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] },
          { event_type: 'focus', filters: [] },
        ],
      },
      { id: 'ch1', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] }, // Duplicate ID for change
      {
        id: 'multi1',
        definition: [
          { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] },
          { event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] },
        ],
      },
      { id: 'eventWithoutDef' }, // Missing definition
      { id: 'eventWithEmptyDef', definition: [] }, // Empty definition array
      { id: 'eventWithNullDefItem', definition: [null, { event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }] },
      { id: 'eventWithInvalidDefObj', definition: [{ some_other_prop: 'value' }] }, // Missing event_type
      { id: 'eventWithOnlyChange', definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }] },
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
            event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
            filters: [
              {
                subprop_key: '[Amplitude] Element Text',
                subprop_op: 'is',
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
            event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
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
            event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT,
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
            event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
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
            event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
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
            event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT,
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
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, // This definition will not match `mockEvent.type`
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Some other text'],
            },
          ],
        },
        {
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, // This definition will match
          filters: [
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'autotrack css match',
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
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Text 1'],
            },
          ],
        },
        {
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'autotrack css match',
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
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Primary Button'],
            },
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'autotrack css match',
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
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Matching Text'],
            },
            {
              subprop_key: '[Amplitude] Element Hierarchy',
              subprop_op: 'autotrack css match',
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
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
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

describe('TriggerEvaluator', () => {
  const executeActionsSpy = jest.spyOn(actionsModule, 'executeActions');
  const matchEventToFilterSpy = jest.spyOn(matchEventToFilterModule, 'matchEventToFilter');

  beforeEach(() => {
    executeActionsSpy.mockClear();
    matchEventToFilterSpy.mockClear();
  });

  const mockMouseEvent = new MouseEvent('click');
  const mockEvent: ElementBasedTimestampedEvent<MouseEvent> = {
    event: mockMouseEvent,
    type: 'click',
    closestTrackedAncestor: document.createElement('div'),
    targetElementProperties: {},
    timestamp: 0,
  };

  const labeledEvents: Record<string, LabeledEvent> = {
    'le-click': {
      id: 'le-click',
      definition: [
        {
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [{ subprop_key: '[Amplitude] Element Text', subprop_op: 'is', subprop_value: ['value'] }],
        },
      ],
    },
    'le-change': {
      id: 'le-change',
      definition: [{ event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT, filters: [] }],
    },
  };

  const triggers: Trigger[] = [
    {
      id: 'trigger-1',
      name: 'Trigger 1',
      actions: [
        {
          id: 'action-1',
          actionType: 'ATTACH_EVENT_PROPERTY',
          destinationKey: 'prop',
          dataSource: { sourceType: 'DOM_ELEMENT', selector: 'div', elementExtractType: 'TEXT' },
        },
      ],
      conditions: [{ type: 'LABELED_EVENT', match: { eventId: 'le-click' } }],
    },
  ];

  const options: ElementInteractionsOptions = {
    pageActions: {
      labeledEvents: labeledEvents,
      triggers: triggers,
    },
  };

  const groupedLabeledEvents = groupLabeledEventIdsByEventType(Object.values(labeledEvents));
  const labeledEventToTriggerMap = createLabeledEventToTriggerMap(triggers);

  it('should do nothing if pageActions is not configured', () => {
    const triggerEvaluator = createTriggerEvaluator(
      groupedLabeledEvents,
      labeledEventToTriggerMap,
      new DataExtractor({}),
      {},
    );
    const result = triggerEvaluator.evaluate(mockEvent);

    expect(result).toBe(mockEvent);
    expect(executeActionsSpy).not.toHaveBeenCalled();
  });

  it('should not call executeActions if no labeled event matches', () => {
    matchEventToFilterSpy.mockReturnValue(false); // No filter match

    const triggerEvaluator = createTriggerEvaluator(
      groupedLabeledEvents,
      labeledEventToTriggerMap,
      new DataExtractor({}),
      options,
    );
    triggerEvaluator.evaluate(mockEvent);

    expect(executeActionsSpy).not.toHaveBeenCalled();
  });

  it('should not call executeActions if a labeled event matches but has no trigger', () => {
    const optionsWithUntriggeredEvent: ElementInteractionsOptions = {
      pageActions: {
        labeledEvents: {
          'untriggered-event': {
            id: 'untriggered-event',
            definition: [{ event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT, filters: [] }],
          },
        },
        triggers: [], // No triggers
      },
    };

    const grouped = groupLabeledEventIdsByEventType(
      Object.values(optionsWithUntriggeredEvent.pageActions?.labeledEvents || {}),
    );
    const triggerMap = createLabeledEventToTriggerMap(optionsWithUntriggeredEvent.pageActions?.triggers || []);

    matchEventToFilterSpy.mockReturnValue(true); // event matches

    const dataExtractor = new DataExtractor({});
    const triggerEvaluator = createTriggerEvaluator(grouped, triggerMap, dataExtractor, optionsWithUntriggeredEvent);
    triggerEvaluator.evaluate(mockEvent);

    expect(executeActionsSpy).not.toHaveBeenCalled();
  });

  it('should call executeActions with correct actions when a trigger is matched', () => {
    matchEventToFilterSpy.mockReturnValue(true); // Labeled event matches

    const dataExtractor = new DataExtractor({});
    const triggerEvaluator = createTriggerEvaluator(
      groupedLabeledEvents,
      labeledEventToTriggerMap,
      dataExtractor,
      options,
    );
    triggerEvaluator.evaluate(mockEvent);

    expect(executeActionsSpy).toHaveBeenCalledTimes(1);
    expect(executeActionsSpy).toHaveBeenCalledWith(triggers[0].actions, mockEvent, dataExtractor);
  });

  it('should handle multiple matching triggers for a single event', () => {
    const multiTrigger: Trigger[] = [
      {
        id: 'trigger-1',
        name: 'Trigger 1',
        actions: [
          {
            id: 'action-1',
            actionType: 'ATTACH_EVENT_PROPERTY',
            destinationKey: 'prop1',
            dataSource: { sourceType: 'DOM_ELEMENT', selector: 'div', elementExtractType: 'TEXT' },
          },
        ],
        conditions: [{ type: 'LABELED_EVENT', match: { eventId: 'le-click' } }],
      },
      {
        id: 'trigger-2',
        name: 'Trigger 2',
        actions: [
          {
            id: 'action-2',
            actionType: 'ATTACH_EVENT_PROPERTY',
            destinationKey: 'prop2',
            dataSource: { sourceType: 'DOM_ELEMENT', selector: 'div', elementExtractType: 'TEXT' },
          },
        ],
        conditions: [{ type: 'LABELED_EVENT', match: { eventId: 'le-click' } }],
      },
    ];

    const multiTriggerOptions: ElementInteractionsOptions = {
      pageActions: {
        labeledEvents,
        triggers: multiTrigger,
      },
    };

    const triggerMap = createLabeledEventToTriggerMap(multiTrigger);
    matchEventToFilterSpy.mockReturnValue(true);

    const dataExtractor = new DataExtractor({});
    const triggerEvaluator = createTriggerEvaluator(
      groupedLabeledEvents,
      triggerMap,
      dataExtractor,
      multiTriggerOptions,
    );
    triggerEvaluator.evaluate(mockEvent);

    expect(executeActionsSpy).toHaveBeenCalledTimes(2);
    expect(executeActionsSpy).toHaveBeenCalledWith(multiTrigger[0].actions, mockEvent, dataExtractor);
    expect(executeActionsSpy).toHaveBeenCalledWith(multiTrigger[1].actions, mockEvent, dataExtractor);
  });

  it('should update state when update method is called', () => {
    const dataExtractor = new DataExtractor({});
    const triggerEvaluator = createTriggerEvaluator(groupedLabeledEvents, labeledEventToTriggerMap, dataExtractor, {});

    // Initially should do nothing since pageActions is empty
    triggerEvaluator.evaluate(mockEvent);
    expect(executeActionsSpy).not.toHaveBeenCalled();

    // Update the evaluator with proper options
    triggerEvaluator.update(groupedLabeledEvents, labeledEventToTriggerMap, options);
    matchEventToFilterSpy.mockReturnValue(true);

    // Now it should execute actions
    triggerEvaluator.evaluate(mockEvent);
    expect(executeActionsSpy).toHaveBeenCalledTimes(1);
    expect(executeActionsSpy).toHaveBeenCalledWith(triggers[0].actions, mockEvent, dataExtractor);
  });
});

describe('autocapturePlugin recomputePageActionsData functionality', () => {
  let plugin: EnrichmentPlugin | undefined;
  let instance: BrowserClient;
  let loggerProvider: ILogger;

  // Mock data
  const mockLabeledEvents: Record<string, LabeledEvent> = {
    'local-event-1': {
      id: 'local-event-1',
      definition: [
        {
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Local Button'],
            },
          ],
        },
      ],
    },
    'local-event-2': {
      id: 'local-event-2',
      definition: [
        {
          event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Local Input'],
            },
          ],
        },
      ],
    },
  };

  const mockTriggers: Trigger[] = [
    {
      id: 'local-trigger-1',
      name: 'Local Trigger',
      conditions: [
        {
          type: 'LABELED_EVENT',
          match: {
            eventId: 'local-event-1',
          },
        },
      ],
      actions: [
        {
          id: 'local-action-1',
          actionType: 'ATTACH_EVENT_PROPERTY',
          dataSource: {
            sourceType: 'DOM_ELEMENT',
            elementExtractType: 'TEXT',
            scope: '.container',
            selector: '.title',
          },
          destinationKey: 'title',
        },
      ],
    },
  ];

  const mockRemoteLabeledEvents: Record<string, LabeledEvent> = {
    'remote-event-1': {
      id: 'remote-event-1',
      definition: [
        {
          event_type: AMPLITUDE_ELEMENT_CLICKED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Remote Button'],
            },
          ],
        },
      ],
    },
    'remote-event-2': {
      id: 'remote-event-2',
      definition: [
        {
          event_type: AMPLITUDE_ELEMENT_CHANGED_EVENT,
          filters: [
            {
              subprop_key: '[Amplitude] Element Text',
              subprop_op: 'is',
              subprop_value: ['Remote Input'],
            },
          ],
        },
      ],
    },
  };

  const mockRemoteTriggers: Trigger[] = [
    {
      id: 'remote-trigger-1',
      name: 'Remote Trigger',
      conditions: [
        {
          type: 'LABELED_EVENT',
          match: {
            eventId: 'remote-event-1',
          },
        },
      ],
      actions: [
        {
          id: 'remote-action-1',
          actionType: 'ATTACH_EVENT_PROPERTY',
          dataSource: {
            sourceType: 'DOM_ELEMENT',
            elementExtractType: 'TEXT',
            scope: '.remote-container',
            selector: '.remote-title',
          },
          destinationKey: 'remote-title',
        },
      ],
    },
  ];

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

  beforeEach(async () => {
    mockWindowLocationFromURL(new URL('https://test.com'));

    loggerProvider = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as ILogger;

    instance = createInstance();
    await instance.init('API_KEY', 'USER_ID').promise;

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    void plugin?.teardown?.();
    if (typeof document !== 'undefined') {
      document.getElementsByTagName('body')[0].innerHTML = '';
    }
    jest.clearAllMocks();
  });

  describe('with local pageActions only', () => {
    it('should initialize with local pageActions', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Verify setup was called (indirectly through the functions being used)
      expect(plugin?.name).toBe('@amplitude/plugin-autocapture-browser');
      expect(plugin?.type).toBe('enrichment');
    });
  });

  describe('with remote config integration', () => {
    it('should fetch remote config and merge with local pageActions', async () => {
      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue({
          labeledEvents: mockRemoteLabeledEvents,
          triggers: mockRemoteTriggers,
        }),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be fetched and processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify remote config fetch was called
      expect(createRemoteConfigFetch).toHaveBeenCalledWith({
        localConfig: config,
        configKeys: ['analyticsSDK.pageActions'],
      });

      expect(mockRemoteConfigFetch.getRemoteConfig).toHaveBeenCalledWith('analyticsSDK', 'pageActions');
    });

    it('should handle remote config fetch errors gracefully', async () => {
      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockRejectedValue(new Error('Remote config fetch failed')),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify error was logged
      expect(loggerProvider.error).toHaveBeenCalledWith(
        'Failed to fetch remote config: Error: Remote config fetch failed',
      );
    });

    it('should handle createRemoteConfigFetch errors gracefully', async () => {
      (createRemoteConfigFetch as jest.Mock).mockRejectedValue(new Error('Failed to create remote config fetch'));

      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify error was logged
      expect(loggerProvider.error).toHaveBeenCalledWith(
        'Failed to create remote config fetch: Error: Failed to create remote config fetch',
      );
    });

    it('should not fetch remote config when fetchRemoteConfig is false', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: false,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait to ensure no remote config processing happens
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify remote config fetch was not called
      expect(createRemoteConfigFetch).not.toHaveBeenCalled();
    });

    it('should handle null/undefined remote pageActions', async () => {
      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue(null),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // No errors should be logged for null remote config
      expect(loggerProvider.error).not.toHaveBeenCalled();
    });

    it('should handle when local pageActions is undefined and remote config provides pageActions', async () => {
      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue({
          labeledEvents: mockRemoteLabeledEvents,
          triggers: mockRemoteTriggers,
        }),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      // Start with undefined pageActions
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: undefined,
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify remote config fetch was called
      expect(createRemoteConfigFetch).toHaveBeenCalledWith({
        localConfig: config,
        configKeys: ['analyticsSDK.pageActions'],
      });

      expect(mockRemoteConfigFetch.getRemoteConfig).toHaveBeenCalledWith('analyticsSDK', 'pageActions');

      // No errors should be logged when starting with undefined pageActions
      expect(loggerProvider.error).not.toHaveBeenCalled();

      // Plugin should still function normally
      expect(plugin?.name).toBe('@amplitude/plugin-autocapture-browser');
      expect(plugin?.type).toBe('enrichment');
    });

    it('should handle when remote pageActions overwrites local labeledEvents with undefined', async () => {
      // Mock the module function before creating the plugin
      const originalGroupLabeledEvents = triggersModule.groupLabeledEventIdsByEventType;
      const groupLabeledEventsSpy = jest.spyOn(triggersModule, 'groupLabeledEventIdsByEventType');
      groupLabeledEventsSpy.mockImplementation(originalGroupLabeledEvents);

      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue({
          // Remote config explicitly sets labeledEvents to undefined, overwriting local
          labeledEvents: undefined,
          triggers: mockRemoteTriggers,
        }),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      // Start with local pageActions that has labeledEvents
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The spy should have been called twice:
      // 1. Once during initial plugin creation with local labeledEvents
      // 2. Once during recomputePageActionsData with empty array (due to undefined labeledEvents after merge)
      expect(groupLabeledEventsSpy).toHaveBeenCalledTimes(2);

      // Check the second call (recomputePageActionsData) received empty array
      const secondCall = groupLabeledEventsSpy.mock.calls[1];
      expect(secondCall[0]).toEqual([]); // Object.values({}) when labeledEvents is undefined

      // No errors should be logged
      expect(loggerProvider.error).not.toHaveBeenCalled();

      groupLabeledEventsSpy.mockRestore();
    });

    it('should handle when both local and remote labeledEvents are undefined', async () => {
      // Mock the module function before creating the plugin
      const originalGroupLabeledEvents = triggersModule.groupLabeledEventIdsByEventType;
      const groupLabeledEventsSpy = jest.spyOn(triggersModule, 'groupLabeledEventIdsByEventType');
      groupLabeledEventsSpy.mockImplementation(originalGroupLabeledEvents);

      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue({
          labeledEvents: undefined,
          triggers: mockRemoteTriggers,
        }),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      // Start with local pageActions that also has undefined labeledEvents
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: undefined as unknown as Record<string, LabeledEvent>,
          triggers: mockTriggers,
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The spy should have been called twice:
      // 1. Once during initial plugin creation with empty array (local labeledEvents undefined)
      // 2. Once during recomputePageActionsData with empty array (remote labeledEvents also undefined)
      expect(groupLabeledEventsSpy).toHaveBeenCalledTimes(2);

      // Both calls should receive empty array due to the "?? {}" fallback
      expect(groupLabeledEventsSpy.mock.calls[0][0]).toEqual([]); // Initial call
      expect(groupLabeledEventsSpy.mock.calls[1][0]).toEqual([]); // recomputePageActionsData call

      // No errors should be logged
      expect(loggerProvider.error).not.toHaveBeenCalled();

      groupLabeledEventsSpy.mockRestore();
    });

    it('should handle when both local and remote triggers are undefined', async () => {
      // Mock the module function before creating the plugin
      const originalCreateLabeledEventToTriggerMap = triggersModule.createLabeledEventToTriggerMap;
      const createLabeledEventToTriggerMapSpy = jest.spyOn(triggersModule, 'createLabeledEventToTriggerMap');
      createLabeledEventToTriggerMapSpy.mockImplementation(originalCreateLabeledEventToTriggerMap);

      const mockRemoteConfigFetch = {
        getRemoteConfig: jest.fn().mockResolvedValue({
          labeledEvents: mockRemoteLabeledEvents,
          triggers: undefined,
        }),
      };

      (createRemoteConfigFetch as jest.Mock).mockResolvedValue(mockRemoteConfigFetch);

      // Start with local pageActions that also has undefined triggers
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: {
          labeledEvents: mockLabeledEvents,
          triggers: undefined as unknown as Trigger[],
        },
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
        fetchRemoteConfig: true,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      // Wait for remote config to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The spy should have been called twice:
      // 1. Once during initial plugin creation with empty array (local triggers undefined)
      // 2. Once during recomputePageActionsData with empty array (remote triggers also undefined)
      expect(createLabeledEventToTriggerMapSpy).toHaveBeenCalledTimes(2);

      // Both calls should receive empty array due to the "?? []" fallback
      expect(createLabeledEventToTriggerMapSpy.mock.calls[0][0]).toEqual([]); // Initial call
      expect(createLabeledEventToTriggerMapSpy.mock.calls[1][0]).toEqual([]); // recomputePageActionsData call

      // No errors should be logged
      expect(loggerProvider.error).not.toHaveBeenCalled();

      createLabeledEventToTriggerMapSpy.mockRestore();
    });
  });

  describe('plugin initialization without pageActions', () => {
    it('should handle initialization without pageActions', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {};

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(plugin?.name).toBe('@amplitude/plugin-autocapture-browser');
      expect(plugin?.type).toBe('enrichment');
    });

    it('should handle undefined pageActions', async () => {
      const autocaptureConfig: ElementInteractionsOptions = {
        pageActions: undefined,
      };

      plugin = autocapturePlugin(autocaptureConfig);
      const config: Partial<BrowserConfig> = {
        defaultTracking: false,
        loggerProvider: loggerProvider,
      };

      await plugin?.setup?.(config as BrowserConfig, instance);

      expect(plugin?.name).toBe('@amplitude/plugin-autocapture-browser');
      expect(plugin?.type).toBe('enrichment');
    });
  });
});
