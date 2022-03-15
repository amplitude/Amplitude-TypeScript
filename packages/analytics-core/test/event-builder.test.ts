import { SpecialEventType } from '@amplitude/analytics-types';
import { Identify } from '../src/identify';
import { createIdentifyEvent, createGroupIdentifyEvent } from '../src/utils/event-builder';

describe('event-builder', () => {
  describe('createIdentifyEvent', () => {
    test('should create event', () => {
      const userId = 'userId';
      const deviceId = 'deviceId';
      const identify = new Identify();
      const event = createIdentifyEvent(userId, deviceId, identify);
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {},
        user_id: 'userId',
        device_id: 'deviceId',
      });
    });

    test('should handle missing deviceId', () => {
      const userId = undefined;
      const deviceId = undefined;
      const identify = new Identify();
      const event = createIdentifyEvent(userId, deviceId, identify);
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {},
        user_id: undefined,
      });
    });
  });

  describe('createGroupIdentifyEvent', () => {
    test('should create event', () => {
      const userId = 'userId';
      const deviceId = 'deviceId';
      const groupType = 'groupType';
      const groupName = 'groupName';
      const identify = new Identify();
      const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify);
      expect(event).toEqual({
        event_type: SpecialEventType.GROUP_IDENTIFY,
        group_properties: {},
        groups: {
          groupType: 'groupName',
        },
        user_id: 'userId',
        device_id: 'deviceId',
      });
    });

    test('should handle missing deviceId', () => {
      const userId = undefined;
      const deviceId = undefined;
      const groupType = 'groupType';
      const groupName = 'groupName';
      const identify = new Identify();
      const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify);
      expect(event).toEqual({
        event_type: SpecialEventType.GROUP_IDENTIFY,
        group_properties: {},
        groups: {
          groupType: 'groupName',
        },
        user_id: undefined,
      });
    });
  });
});
