import { Targeting } from '../src/targeting';
import { flagConfig } from './flag-config-data';

const mockEvent = {
  event_type: 'sign_in',
};
const mockUserProperties = {};

describe('targeting', () => {
  describe('evaluateTargeting', () => {
    test('should call evaluation engine evaluate', () => {
      const targeting = new Targeting();
      const mockEngineEvaluate = jest.fn();
      targeting.evaluationEngine.evaluate = mockEngineEvaluate;
      targeting.evaluateTargeting({
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
