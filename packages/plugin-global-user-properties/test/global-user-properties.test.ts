import { globalUserPropertiesPlugin } from '../src/global-user-properties';
import { BaseEvent, IdentifyEvent, RevenueEvent, SpecialEventType } from '@amplitude/analytics-types';

describe('globalUserPropertiesPlugin', () => {
  const TEST_USER_PROPERTIES = {
    USER_PROPERTY_ONE: 'TEST_VALUE_ONE',
  };

  const TEST_USER_IDENTIFY_PROPERTIES = {
    $set: {
      USER_PROPERTY_ONE: 'TEST_VALUE_ONE',
    },
  };

  test('adds global properties on regular events', async () => {
    const plugin = globalUserPropertiesPlugin();

    const event: BaseEvent = {
      event_type: 'NOT A REAL EVENT TYPE',
      user_properties: TEST_USER_PROPERTIES,
    };

    const newEvent = await plugin.execute?.({ ...event });

    expect(newEvent?.event_type).toEqual(event.event_type);
    expect(newEvent?.global_user_properties).toStrictEqual(TEST_USER_PROPERTIES);
    expect(newEvent?.user_properties).toStrictEqual(undefined);
  });

  test('adds global properties on identify events', async () => {
    const plugin = globalUserPropertiesPlugin();

    const event: IdentifyEvent = {
      event_type: SpecialEventType.IDENTIFY,
      user_properties: TEST_USER_IDENTIFY_PROPERTIES,
    };

    const newEvent = await plugin.execute?.({ ...event });

    expect(newEvent?.global_user_properties).toStrictEqual(TEST_USER_IDENTIFY_PROPERTIES);
    expect(newEvent?.user_properties).toStrictEqual(undefined);
  });

  test('does not add global properties on revenue events', async () => {
    const plugin = globalUserPropertiesPlugin();

    const event: RevenueEvent = {
      event_type: SpecialEventType.REVENUE,
      revenue: 3,
      event_properties: {},
    };

    const newEvent = await plugin.execute?.({ ...event });

    expect(newEvent?.global_user_properties).toStrictEqual(undefined);
    expect(newEvent?.user_properties).toStrictEqual(event.user_properties);
  });

  test('adds global properties and user properties on identify events with shouldKeepOriginalUserProperties option', async () => {
    const plugin = globalUserPropertiesPlugin({ shouldKeepOriginalUserProperties: true });

    const event: IdentifyEvent = {
      event_type: SpecialEventType.IDENTIFY,
      user_properties: TEST_USER_IDENTIFY_PROPERTIES,
    };

    const newEvent = await plugin.execute?.({ ...event });

    expect(newEvent?.global_user_properties).toStrictEqual(TEST_USER_IDENTIFY_PROPERTIES);
    expect(newEvent?.user_properties).toStrictEqual(TEST_USER_IDENTIFY_PROPERTIES);
  });
});
