import { Targeting } from '../src/targeting';
<<<<<<< HEAD
=======
import { targetingIDBStore } from '../src/targeting-idb-store';
>>>>>>> 7ea29d5c (fix(targeting): keep track of open db instances and ensure deduplication of events)
import { flagConfig } from './flag-config-data';

const mockEvent = {
  event_type: 'sign_in',
  time: 123,
};
const mockUserProperties = {};

describe('targeting', () => {
  describe('evaluateTargeting', () => {
    test('should call evaluation engine evaluate', () => {
      const targeting = new Targeting();
      const mockEngineEvaluate = jest.fn();
      targeting.evaluationEngine.evaluate = mockEngineEvaluate;
<<<<<<< HEAD
      targeting.evaluateTargeting({
=======
      await targeting.evaluateTargeting({
        deviceId: '1a2b3c',
        userProperties: mockUserProperties,
        flag: flagConfig,
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
        [flagConfig],
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
>>>>>>> 7ea29d5c (fix(targeting): keep track of open db instances and ensure deduplication of events)
        deviceId: '1a2b3c',
        event: mockEvent,
        userProperties: mockUserProperties,
        flag: flagConfig,
      });
      expect(mockEngineEvaluate).toHaveBeenCalledWith(
        {
          event: mockEvent,
          user: {
            device_id: '1a2b3c',
            user_properties: mockUserProperties,
          },
        },
        [flagConfig],
      );
    });
  });
});
