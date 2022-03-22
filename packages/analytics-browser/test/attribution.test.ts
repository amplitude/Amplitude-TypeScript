import * as core from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';
import * as queryParams from '../src/utils/query-params';
import * as attribution from '../src/attribution';
import { useDefaultConfig } from './helpers/default';
import * as UTMCookieModule from '../src/storage/utm-cookie';

describe('attribution', () => {
  describe('trackAttributions', () => {
    test('should track attributions', () => {
      const getUtmParam = jest.spyOn(attribution, 'getUtmParam').mockReturnValueOnce({
        utm_source: 'marketing',
        utm_medium: undefined,
      });
      const getReferrer = jest.spyOn(attribution, 'getReferrer').mockReturnValueOnce({});
      const getGclid = jest.spyOn(attribution, 'getGclid').mockReturnValueOnce({});
      const getFbclid = jest.spyOn(attribution, 'getFbclid').mockReturnValueOnce({});
      const identify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          message: Status.Success,
          code: 200,
        }),
      );
      const config = useDefaultConfig();
      attribution.trackAttributions(config);
      expect(getUtmParam).toHaveBeenCalledTimes(1);
      expect(getReferrer).toHaveBeenCalledTimes(1);
      expect(getGclid).toHaveBeenCalledTimes(1);
      expect(getFbclid).toHaveBeenCalledTimes(1);
      expect(identify).toHaveBeenCalledTimes(1);
    });

    test('should not track due to config', () => {
      const getUtmParam = jest.spyOn(attribution, 'getUtmParam').mockReturnValueOnce({});
      const getReferrer = jest.spyOn(attribution, 'getReferrer').mockReturnValueOnce({});
      const getGclid = jest.spyOn(attribution, 'getGclid').mockReturnValueOnce({});
      const getFbclid = jest.spyOn(attribution, 'getFbclid').mockReturnValueOnce({});
      const identify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          message: Status.Success,
          code: 200,
        }),
      );
      const config = useDefaultConfig(undefined, {
        includeUtm: false,
        includeReferrer: false,
        includeGclid: false,
        includeFbclid: false,
      });
      attribution.trackAttributions(config);
      expect(getUtmParam).toHaveBeenCalledTimes(0);
      expect(getReferrer).toHaveBeenCalledTimes(0);
      expect(getGclid).toHaveBeenCalledTimes(0);
      expect(getFbclid).toHaveBeenCalledTimes(0);
      expect(identify).toHaveBeenCalledTimes(0);
    });

    test('should handle no attributions', () => {
      const getUtmParam = jest.spyOn(attribution, 'getUtmParam').mockReturnValueOnce({});
      const getReferrer = jest.spyOn(attribution, 'getReferrer').mockReturnValueOnce({});
      const getGclid = jest.spyOn(attribution, 'getGclid').mockReturnValueOnce({});
      const getFbclid = jest.spyOn(attribution, 'getFbclid').mockReturnValueOnce({});
      const identify = jest.spyOn(core, 'identify').mockReturnValueOnce(
        Promise.resolve({
          event: {
            event_type: 'hello',
          },
          message: Status.Success,
          code: 200,
        }),
      );
      const config = useDefaultConfig();
      attribution.trackAttributions(config);
      expect(getUtmParam).toHaveBeenCalledTimes(1);
      expect(getReferrer).toHaveBeenCalledTimes(1);
      expect(getGclid).toHaveBeenCalledTimes(1);
      expect(getFbclid).toHaveBeenCalledTimes(1);
      expect(identify).toHaveBeenCalledTimes(0);
    });
  });

  describe('getUtmParam', () => {
    test('should return utm param from query params', () => {
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({
        utm_source: 'utm_source',
        utm_medium: 'utm_medium',
        utm_campaign: 'utm_campaign',
        utm_term: 'utm_term',
        utm_content: 'utm_content',
      });
      const data = attribution.getUtmParam();
      expect(data).toEqual({
        utm_source: 'utm_source',
        utm_medium: 'utm_medium',
        utm_campaign: 'utm_campaign',
        utm_term: 'utm_term',
        utm_content: 'utm_content',
      });
      expect(getQueryParams).toHaveBeenCalledTimes(1);
    });

    test('should return utm param from cookies', () => {
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      jest.spyOn(UTMCookieModule, 'UTMCookie').mockReturnValueOnce({
        options: {},
        isEnabled: () => true,
        get: () => ({
          utmcsr: 'utmcsr',
          utmcmd: 'utmcmd',
          utmccn: 'utmccn',
          utmctr: 'utmctr',
          utmcct: 'utmcct',
        }),
        findByKey: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        reset: jest.fn(),
      });
      const data = attribution.getUtmParam();
      expect(data).toEqual({
        utm_source: 'utmcsr',
        utm_medium: 'utmcmd',
        utm_campaign: 'utmccn',
        utm_term: 'utmctr',
        utm_content: 'utmcct',
      });
      expect(getQueryParams).toHaveBeenCalledTimes(1);
    });

    test('should return empty object', () => {
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      jest.spyOn(UTMCookieModule, 'UTMCookie').mockReturnValueOnce({
        options: {},
        isEnabled: () => true,
        get: () => ({}),
        findByKey: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
        reset: jest.fn(),
      });
      const data = attribution.getUtmParam();
      expect(data).toEqual({});
      expect(getQueryParams).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReferrer', () => {
    afterEach(() => {
      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
      });
    });

    test('should return referrer info', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://amplitude.com',
        writable: true,
      });
      const data = attribution.getReferrer();
      expect(data).toEqual({
        referrer: 'https://amplitude.com',
        referring_domain: 'amplitude.com',
      });
    });

    test('should not return referring_domain', () => {
      Object.defineProperty(document, 'referrer', {
        value: undefined,
        writable: true,
      });
      const data = attribution.getReferrer();
      expect(data).toEqual({});
    });
  });

  describe('getGclid', () => {
    test('should return gclid data', () => {
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({
        gclid: 'hello',
      });
      const data = attribution.getGclid();
      expect(data).toEqual({
        gclid: 'hello',
      });
    });

    test('should return empty data', () => {
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      const data = attribution.getGclid();
      expect(data).toEqual({});
    });
  });

  describe('getFbclid', () => {
    test('should return fbclid data', () => {
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({
        fbclid: 'hello',
      });
      const data = attribution.getFbclid();
      expect(data).toEqual({
        fbclid: 'hello',
      });
    });

    test('should return empty data', () => {
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      const data = attribution.getFbclid();
      expect(data).toEqual({});
    });
  });
});
