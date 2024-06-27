import { Logger } from '@amplitude/analytics-types';
import { Targeting } from '../src/targeting';
import { targetingIDBStore } from '../src/targeting-idb-store';
import { flagCatchAll } from './flag-config-data/catch-all';
import { flagEventProps } from './flag-config-data/event-props';
import { flagConfigMultipleConditions } from './flag-config-data/multiple-conditions';
import { flagConfigMultipleEvents } from './flag-config-data/multiple-events';
import { flagUserProps } from './flag-config-data/user-props';

type MockedLogger = jest.Mocked<Logger>;
const mockEvent = {
  event_type: 'sign_in',
  time: 123,
};
const mockUserProperties = {};

const mockLoggerProvider: MockedLogger = {
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
describe('targeting', () => {
  describe('evaluateTargeting', () => {
    test('should call evaluation engine evaluate', async () => {
      const targeting = new Targeting();
      const mockEngineEvaluate = jest.fn();
      targeting.evaluationEngine.evaluate = mockEngineEvaluate;
      await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: mockUserProperties,
        flag: flagCatchAll,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockEngineEvaluate).toHaveBeenCalledWith(
        {
          user: {
            device_id: '1a2b3c',
            user_properties: mockUserProperties,
          },
          session_id: 123,
          event_types: undefined,
        },
        [flagCatchAll],
      );
    });
    test('should pass a list of event types to the evaluation engine evaluate', async () => {
      jest.spyOn(targetingIDBStore, 'storeEventTypeForSession').mockResolvedValueOnce({
        'Add to Cart': { 123: { event_type: 'Add to Cart' } },
        Purchase: { 123: { event_type: 'Purchase' } },
      });
      const targeting = new Targeting();
      const mockEngineEvaluate = jest.fn();
      targeting.evaluationEngine.evaluate = mockEngineEvaluate;
      await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        event: mockEvent,
        userProperties: mockUserProperties,
        flag: flagCatchAll,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(mockEngineEvaluate).toHaveBeenCalledWith(
        {
          event: mockEvent,
          user: {
            device_id: '1a2b3c',
            user_properties: mockUserProperties,
          },
          session_id: 123,
          event_types: ['Add to Cart', 'Purchase'],
        },
        [flagCatchAll],
      );
    });
  });

  describe('condition tests', () => {
    test('should work with event properties', async () => {
      const targeting = new Targeting();
      const targetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: mockUserProperties,
        flag: flagEventProps,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
        event: {
          event_type: 'Purchase',
          event_properties: {
            '[Amplitude] Page URL': 'http://localhost:3000/tasks-app',
          },
        },
      });
      expect(targetingBucket['sr_targeting_config'].key).toEqual('on');
    });
    test('should work with a user property condition', async () => {
      const targeting = new Targeting();
      const targetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: {
          plan_id: 'paid',
        },
        flag: flagUserProps,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(targetingBucket['sr_targeting_config'].key).toEqual('on');
    });
    test('should work with multiple events', async () => {
      const targeting = new Targeting();
      const targetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: {},
        event: {
          event_type: 'Add to Cart',
          time: 123,
        },
        flag: flagConfigMultipleEvents,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      // Should not match with only one event
      expect(targetingBucket['sr_targeting_config'].key).toEqual('off');
      const updatedTargetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: {},
        event: {
          event_type: 'Sign In',
          time: 123,
        },
        flag: flagConfigMultipleEvents,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      console.log('targetingBucket', targetingBucket);
      expect(updatedTargetingBucket['sr_targeting_config'].key).toEqual('on');
    });
    test('should work with multiple conditions in a segment - user property and event', async () => {
      const targeting = new Targeting();
      // Only user properties match the flag config here, bucket should be on
      const userPropertyTargetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: {
          name: 'Banana',
        },
        flag: flagConfigMultipleConditions,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(userPropertyTargetingBucket['sr_targeting_config'].key).toEqual('on');
      // Only the event type matches the flag config here, bucket should be on
      const eventTargetingBucket = await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: {},
        event: {
          event_type: 'Sign In',
          time: 123,
        },
        flag: flagConfigMultipleConditions,
        sessionId: 123,
        apiKey: 'static_key',
        loggerProvider: mockLoggerProvider,
      });
      expect(eventTargetingBucket['sr_targeting_config'].key).toEqual('on');
    });
  });
});
