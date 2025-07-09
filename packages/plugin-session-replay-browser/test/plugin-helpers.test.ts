import { parseUserProperties } from '../src/helpers';
import { Event, IdentifyOperation } from '@amplitude/analytics-types';

describe('Plugin Helpers', () => {
  describe('parseUserProperties', () => {
    test('should return undefined when event has no user_properties', () => {
      const event: Event = {
        event_type: 'test_event',
      };

      const result = parseUserProperties(event);
      expect(result).toBeUndefined();
    });

    test('should parse SET operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.SET]: {
            name: 'John',
            age: 30,
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        name: 'John',
        age: 30,
      });
    });

    test('should parse SET_ONCE operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.SET_ONCE]: {
            initial_signup: '2023-01-01',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        initial_signup: '2023-01-01',
      });
    });

    test('should parse ADD operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.ADD]: {
            score: 100,
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        score: 100,
      });
    });

    test('should parse APPEND operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.APPEND]: {
            tags: 'new_tag',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        tags: 'new_tag',
      });
    });

    test('should parse PREPEND operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.PREPEND]: {
            history: 'first_item',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        history: 'first_item',
      });
    });

    test('should ignore PREINSERT operation (not in PROPERTY_ADD_OPERATIONS)', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.PREINSERT]: {
            list: 'item',
          },
          [IdentifyOperation.SET]: {
            name: 'John',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        name: 'John',
      });
    });

    test('should parse POSTINSERT operation correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.POSTINSERT]: {
            queue: 'new_item',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        queue: 'new_item',
      });
    });

    test('should parse multiple operations correctly', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.SET]: {
            name: 'John',
            age: 30,
          },
          [IdentifyOperation.ADD]: {
            score: 100,
          },
          [IdentifyOperation.APPEND]: {
            tags: 'premium',
          },
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        name: 'John',
        age: 30,
        score: 100,
        tags: 'premium',
      });
    });

    test('should ignore non-identify operations', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.SET]: {
            name: 'John',
          },
          [IdentifyOperation.UNSET]: ['old_property'],
          [IdentifyOperation.CLEAR_ALL]: true,
          custom_property: 'should_be_ignored',
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({
        name: 'John',
      });
    });

    test('should handle empty operations object', () => {
      const event: Event = {
        event_type: 'test_event',
        user_properties: {
          [IdentifyOperation.SET]: {},
        },
      };

      const result = parseUserProperties(event);
      expect(result).toEqual({});
    });
  });
});
