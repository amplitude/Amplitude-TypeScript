import { AnalyticsConnector } from '@amplitude/analytics-connector';
import { getAnalyticsConnector, setConnectorDeviceId, setConnectorUserId } from '../src/analytics-connector';

describe('analytics-connector', () => {
  describe('getAnalyticsConnector', () => {
    test('should return connector instance', () => {
      const instance = new AnalyticsConnector();
      const getInstance = jest.spyOn(AnalyticsConnector, 'getInstance').mockReturnValueOnce(instance);
      expect(getAnalyticsConnector()).toBe(instance);
      expect(getInstance).toHaveBeenCalledTimes(1);
    });
  });

  describe('setConnectorUserId', () => {
    test('should return connector instance', () => {
      const commit = jest.fn();
      const identityEditor = {
        setUserId: function () {
          return this;
        },
        setDeviceId: function () {
          return this;
        },
        setUserProperties: function () {
          return this;
        },
        updateUserProperties: function () {
          return this;
        },
        setOptOut: function () {
          return this;
        },
        commit,
      };
      const instance = new AnalyticsConnector();
      jest.spyOn(instance.identityStore, 'editIdentity').mockReturnValueOnce(identityEditor);
      const getInstance = jest.spyOn(AnalyticsConnector, 'getInstance').mockReturnValueOnce(instance);
      expect(setConnectorUserId('123')).toBe(undefined);
      expect(getInstance).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledTimes(1);
    });
  });

  describe('setConnectorDeviceId', () => {
    test('should return connector instance', () => {
      const commit = jest.fn();
      const identityEditor = {
        setUserId: function () {
          return this;
        },
        setDeviceId: function () {
          return this;
        },
        setUserProperties: function () {
          return this;
        },
        updateUserProperties: function () {
          return this;
        },
        setOptOut: function () {
          return this;
        },
        commit,
      };
      const instance = new AnalyticsConnector();
      jest.spyOn(instance.identityStore, 'editIdentity').mockReturnValueOnce(identityEditor);
      const getInstance = jest.spyOn(AnalyticsConnector, 'getInstance').mockReturnValueOnce(instance);
      expect(setConnectorDeviceId('123')).toBe(undefined);
      expect(getInstance).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledTimes(1);
    });
  });
});
