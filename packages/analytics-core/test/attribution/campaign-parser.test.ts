import { BASE_CAMPAIGN } from '../../src/attribution/constants';
import { CampaignParser } from '../../src/attribution/campaign-parser';
import * as queryParams from '../../src/query-params';

beforeAll(() => {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    },
    writable: true,
  });
  Object.defineProperty(document, 'referrer', {
    value: '',
    writable: true,
  });
});

describe('campaign-parser', () => {
  describe('parse', () => {
    test('should return parameters', async () => {
      const parser = new CampaignParser();
      const referringDomain = 'https://google.com';
      const search = '?utm_campaign=utm_campaign&gclid=123';
      (document.referrer as any) = referringDomain;
      window.location.search = search;

      const campaign = await parser.parse();
      expect(campaign).toEqual({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
        referrer: 'https://google.com',
        referring_domain: 'google.com',
        gclid: '123',
      });
    });
  });

  describe('getUtmParam', () => {
    test('should return utm param from query params', async () => {
      const parser = new CampaignParser();
      const getQueryParams = jest.spyOn(queryParams, 'getQueryParams');
      window.location.search =
        '?utm_source=utm_source&utm_medium=utm_medium&utm_campaign=utm_campaign&utm_term=utm_term&utm_content=utm_content';
      const utmParam = parser.getUtmParam();
      expect(utmParam).toEqual({
        utm_source: 'utm_source',
        utm_medium: 'utm_medium',
        utm_campaign: 'utm_campaign',
        utm_term: 'utm_term',
        utm_content: 'utm_content',
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
