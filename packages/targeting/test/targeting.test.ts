import { Logger } from '@amplitude/analytics-types';
import { Targeting } from '../src/targeting';
import { targetingIDBStore } from '../src/targeting-idb-store';
import { flagConfig } from './flag-config-data';

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
        deviceId: '1a2b3c',
        event: mockEvent,
        userProperties: mockUserProperties,
        flag: flagConfig,
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
        [flagConfig],
      );
    });
  });
});
