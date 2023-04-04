import { SpecialEventType } from '@amplitude/analytics-types';
import { Identify } from '../../src/identify';
import {
  createTrackEvent,
  createIdentifyEvent,
  createGroupIdentifyEvent,
  createGroupEvent,
} from '../../src/utils/event-builder';

describe('event-builder', () => {
  describe('createTrackEvent', () => {
    test('should create event', () => {
      const eventType = 'track event';
      const eventProperties = { event: 'test' };
      const eventOptions = { user_id: 'eventUserId' };
      const event = createTrackEvent(eventType, eventProperties, eventOptions);
      expect(event).toEqual({
        event_properties: { event: 'test' },
        event_type: 'track event',
        user_id: 'eventUserId',
      });
    });

    test('should create with plain event', () => {
      const plainEvent = {
        event_type: 'track event',
        groups: {
          org: '15',
        },
      };
      const event = createTrackEvent(plainEvent);
      expect(event).toEqual({
        event_type: 'track event',
        groups: {
          org: '15',
        },
      });
    });

    test('should handle missing event properties', () => {
      const eventType = 'track event';
      const event = createTrackEvent(eventType);
      expect(event).toEqual({
        event_type: 'track event',
      });
    });

    test('should include group info from event options and ignore from event', () => {
      const eventType = 'track event';
      const event = createTrackEvent(
        {
          event_type: eventType,
          groups: { a: 'c' },
          group_properties: {
            $set: {
              z: 'y',
            },
          },
        },
        undefined,
        {
          groups: { a: 'b' },
          group_properties: {
            $set: {
              x: 'y',
            },
          },
        },
      );
      expect(event).toEqual({
        event_type: 'track event',
        groups: { a: 'b' },
        group_properties: {
          $set: {
            x: 'y',
          },
        },
      });
    });
  });

  describe('createIdentifyEvent', () => {
    test('should create event', () => {
      const identify = new Identify();
      const eventOptions = { user_id: 'userId', device_id: 'deviceId' };
      const event = createIdentifyEvent(identify, eventOptions);
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {},
        user_id: 'userId',
        device_id: 'deviceId',
      });
    });

    test('should handle missing deviceId', () => {
      const identify = new Identify();
      const event = createIdentifyEvent(identify);
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {},
      });
    });
  });

  describe('createGroupEvent', () => {
    test('should create group event', () => {
      const eventOptions = { user_id: 'userId', device_id: 'deviceId' };
      const event = createGroupEvent('a', 'b', eventOptions);
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {
          $set: {
            a: 'b',
          },
        },
        groups: {
          a: 'b',
        },
        user_id: 'userId',
        device_id: 'deviceId',
      });
    });

    test('should handle missing event options', () => {
      const event = createGroupEvent('a', 'b');
      expect(event).toEqual({
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {
          $set: {
            a: 'b',
          },
        },
        groups: {
          a: 'b',
        },
      });
    });
  });

  describe('createGroupIdentifyEvent', () => {
    test('should create event', () => {
      const groupType = 'groupType';
      const groupName = 'groupName';
      const identify = new Identify();
      const eventOptions = { user_id: 'userId', device_id: 'deviceId' };
      const event = createGroupIdentifyEvent(groupType, groupName, identify, eventOptions);
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
      const groupType = 'groupType';
      const groupName = 'groupName';
      const identify = new Identify();
      const event = createGroupIdentifyEvent(groupType, groupName, identify);
      expect(event).toEqual({
        event_type: SpecialEventType.GROUP_IDENTIFY,
        group_properties: {},
        groups: {
          groupType: 'groupName',
        },
      });
    });
  });
});
