import { BASE_CAMPAIGN } from '../../src/attribution/constants';
import { CampaignParser } from '../../src/attribution/campaign-parser';
import * as queryParams from '../../src/query-params';

describe('campaign-parser', () => {
  describe('parse', () => {
    test('should return parameters', async () => {
      const parser = new CampaignParser();
      jest.spyOn(parser, 'getUtmParam').mockResolvedValue({
        utm_campaign: 'utm_campaign',
        utm_source: undefined,
        utm_medium: undefined,
        utm_term: undefined,
        utm_content: undefined,
      });

      jest.spyOn(parser, 'getReferrer').mockReturnValue({
        referrer: 'https://google.com',
        referring_domain: undefined,
      });

      jest.spyOn(parser, 'getClickIds').mockReturnValue({
        gclid: '123',
        fbclid: undefined,
      });

      const campaign = await parser.parse();
      expect(campaign).toEqual({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
        referrer: 'https://google.com',
        gclid: '123',
      });
    });
  });

  describe('getUtmParam', () => {
    test('should return utm param from query params', async () => {
      const parser = new CampaignParser();
      jest.spyOn(parser.utmCookieStorage, 'isEnabled').mockReturnValueOnce(Promise.resolve(false));
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({
        utm_source: 'utm_source',
        utm_medium: 'utm_medium',
        utm_campaign: 'utm_campaign',
        utm_term: 'utm_term',
        utm_content: 'utm_content',
      });
      const utmParam = await parser.getUtmParam();
      expect(utmParam).toEqual({
        utm_source: 'utm_source',
        utm_medium: 'utm_medium',
        utm_campaign: 'utm_campaign',
        utm_term: 'utm_term',
        utm_content: 'utm_content',
      });
      expect(getQueryParams).toHaveBeenCalledTimes(1);
    });

    test('should return utm param from from cookies', async () => {
      const parser = new CampaignParser();
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      jest.spyOn(parser.utmCookieStorage, 'isEnabled').mockResolvedValueOnce(true);
      jest.spyOn(parser.utmCookieStorage, 'get').mockResolvedValueOnce({
        utmcsr: 'utmcsr',
        utmcmd: 'utmcmd',
        utmccn: 'utmccn',
        utmctr: 'utmctr',
        utmcct: 'utmcct',
      });
      const utmParam = await parser.getUtmParam();
      expect(utmParam).toEqual({
        utm_source: 'utmcsr',
        utm_medium: 'utmcmd',
        utm_campaign: 'utmccn',
        utm_term: 'utmctr',
        utm_content: 'utmcct',
      });
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
      const parser = new CampaignParser();
      const referrer = parser.getReferrer();
      expect(referrer).toEqual({
        referrer: 'https://amplitude.com',
        referring_domain: 'amplitude.com',
      });
    });

    test('should return not referrer info', () => {
      Object.defineProperty(document, 'referrer', {
        value: undefined,
        writable: true,
      });
      const parser = new CampaignParser();
      const referrer = parser.getReferrer();
      expect(referrer).toEqual({});
    });
  });

  describe('getGclid', () => {
    test('should return gclid data', () => {
      const parser = new CampaignParser();
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({
        gclid: 'hello google',
        fbclid: 'hello fb',
      });
      const data = parser.getClickIds();
      expect(data).toEqual({
        gclid: 'hello google',
        fbclid: 'hello fb',
      });
    });

    test('should return empty data', () => {
      const parser = new CampaignParser();
      jest.spyOn(queryParams, 'getQueryParams').mockReturnValueOnce({});
      const data = parser.getClickIds();
      expect(data).toEqual({});
    });
  });
});
