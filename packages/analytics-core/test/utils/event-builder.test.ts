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

    test('should handle missing event properties', () => {
      const eventType = 'track event';
      const event = createTrackEvent(eventType);
      expect(event).toEqual({
        event_type: 'track event',
      });
    });
  });

  describe('createIdentifyEvent', () => {
    test('should create event', () => {
      const userId = 'userId';
      const deviceId = 'deviceId';
      const identify = new Identify();
      const eventOptions = { user_id: 'eventUserId' };
      const event = createIdentifyEvent(userId, deviceId, identify, eventOptions);
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

  describe('createGroupEvent', () => {
    test('should create group event', () => {
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
      const userId = 'userId';
      const deviceId = 'deviceId';
      const groupType = 'groupType';
      const groupName = 'groupName';
      const identify = new Identify();
      const eventOptions = { user_id: 'eventUserId' };
      const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify, eventOptions);
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
