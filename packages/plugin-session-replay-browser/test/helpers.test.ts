import { SpecialEventType } from '@amplitude/analytics-types';
import { parseUserProperties } from '../src/helpers';

describe('helpers', () => {
  test('should return undefined if no user properties', () => {
    const userProperties = parseUserProperties({
      event_type: SpecialEventType.IDENTIFY,
      session_id: 123,
    });
    expect(userProperties).toEqual(undefined);
  });

  test('should parse properties from their operation', () => {
    const userProperties = parseUserProperties({
      event_type: SpecialEventType.IDENTIFY,
      user_properties: {
        $set: {
          plan_id: 'free',
        },
      },
      session_id: 123,
    });
    expect(userProperties).toEqual({
      plan_id: 'free',
    });
  });

  test('should return an empty object if operations are not additive', () => {
    const userProperties = parseUserProperties({
      event_type: SpecialEventType.IDENTIFY,
      user_properties: {
        $remove: {
          plan_id: 'free',
        },
      },
      session_id: 123,
    });
    expect(userProperties).toEqual({});
  });
});
