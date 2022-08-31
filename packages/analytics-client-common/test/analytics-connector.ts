import { AnalyticsConnector } from '@amplitude/analytics-connector';
import { getAnalyticsConnector } from '../src/analytics-connector';

describe('analytics-connector', () => {
  describe('getAnalyticsConnector', () => {
    test('should return connector instance', () => {
      const instance = new AnalyticsConnector();
      const getInstance = jest.spyOn(AnalyticsConnector, 'getInstance').mockReturnValueOnce(instance);
      expect(getAnalyticsConnector()).toBe(instance);
      expect(getInstance).toHaveBeenCalledTimes(1);
    });
  });
});
