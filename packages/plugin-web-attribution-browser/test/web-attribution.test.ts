import { createInstance } from '@amplitude/analytics-browser';
import { BASE_CAMPAIGN, CampaignParser, CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { webAttributionPlugin } from '../src/web-attribution';
import * as helpers from '../src/helpers';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { Logger, UUID } from '@amplitude/analytics-core';

describe('webAttributionPlugin', () => {
  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
    offline: false,
    optOut: false,
    serverUrl: undefined,
    transportProvider: new FetchTransport(),
    useBatch: false,

    cookieOptions: {
      domain: '.amplitude.com',
      expiration: 365,
      sameSite: 'Lax',
      secure: false,
      upgrade: true,
    },
    cookieStorage: new CookieStorage(),
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  };

  describe('setup', () => {
    describe('should send an identify event', () => {
      test('when a campaign changes', async () => {
        const amplitude = createInstance();
        const setSessionId = jest.spyOn(amplitude, 'setSessionId');
        const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: '$identify',
            },
          }),
        });
        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        const plugin = webAttributionPlugin();
        const overrideMockConfig = {
          ...mockConfig,
          cookieOptions: undefined,
        };
        await plugin.setup?.(overrideMockConfig, amplitude);
        expect(track).toHaveBeenCalledWith({
          event_type: '$identify',
          user_properties: {
            $set: {
              utm_source: 'amp-test',
            },
            $setOnce: {
              initial_dclid: 'EMPTY',
              initial_fbclid: 'EMPTY',
              initial_gbraid: 'EMPTY',
              initial_gclid: 'EMPTY',
              initial_ko_click_id: 'EMPTY',
              initial_li_fat_id: 'EMPTY',
              initial_msclkid: 'EMPTY',
              initial_wbraid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
              initial_rtd_cid: 'EMPTY',
              initial_ttclid: 'EMPTY',
              initial_twclid: 'EMPTY',
              initial_utm_campaign: 'EMPTY',
              initial_utm_content: 'EMPTY',
              initial_utm_id: 'EMPTY',
              initial_utm_medium: 'EMPTY',
              initial_utm_source: 'amp-test',
              initial_utm_term: 'EMPTY',
            },
            $unset: {
              dclid: '-',
              fbclid: '-',
              gbraid: '-',
              gclid: '-',
              ko_click_id: '-',
              li_fat_id: '-',
              msclkid: '-',
              wbraid: '-',
              referrer: '-',
              referring_domain: '-',
              rtd_cid: '-',
              ttclid: '-',
              twclid: '-',
              utm_campaign: '-',
              utm_content: '-',
              utm_id: '-',
              utm_medium: '-',
              utm_term: '-',
            },
          },
        });
        expect(track).toHaveBeenCalledTimes(1);
        expect(setSessionId).toHaveBeenCalledTimes(0);
      });

      test('when a campaign changes and reset session id', async () => {
        const amplitude = createInstance();
        const setSessionId = jest.spyOn(amplitude, 'setSessionId');
        const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: '$identify',
            },
          }),
        });
        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        const plugin = webAttributionPlugin({
          resetSessionOnNewCampaign: true,
        });
        await plugin.setup?.(mockConfig, amplitude);
        expect(track).toHaveBeenCalledWith({
          event_type: '$identify',
          user_properties: {
            $set: {
              utm_source: 'amp-test',
            },
            $setOnce: {
              initial_dclid: 'EMPTY',
              initial_fbclid: 'EMPTY',
              initial_gbraid: 'EMPTY',
              initial_gclid: 'EMPTY',
              initial_ko_click_id: 'EMPTY',
              initial_li_fat_id: 'EMPTY',
              initial_msclkid: 'EMPTY',
              initial_wbraid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
              initial_rtd_cid: 'EMPTY',
              initial_ttclid: 'EMPTY',
              initial_twclid: 'EMPTY',
              initial_utm_campaign: 'EMPTY',
              initial_utm_content: 'EMPTY',
              initial_utm_id: 'EMPTY',
              initial_utm_medium: 'EMPTY',
              initial_utm_source: 'amp-test',
              initial_utm_term: 'EMPTY',
            },
            $unset: {
              dclid: '-',
              fbclid: '-',
              gbraid: '-',
              gclid: '-',
              ko_click_id: '-',
              li_fat_id: '-',
              msclkid: '-',
              wbraid: '-',
              referrer: '-',
              referring_domain: '-',
              rtd_cid: '-',
              ttclid: '-',
              twclid: '-',
              utm_campaign: '-',
              utm_content: '-',
              utm_id: '-',
              utm_medium: '-',
              utm_term: '-',
            },
          },
        });
        expect(track).toHaveBeenCalledTimes(1);
        expect(setSessionId).toHaveBeenCalledTimes(1);
      });
    });

    describe('should not send an identify event', () => {
      test('when a campaign does not change', async () => {
        const amplitude = createInstance();
        const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: '$identify',
            },
          }),
        });
        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(false);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        const plugin = webAttributionPlugin({
          excludeReferrers: [],
        });
        await plugin.setup?.(mockConfig, amplitude);
        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });

  test('should not send attribution event on default excluded referrer', async () => {
    const amplitude = createInstance();
    const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
      promise: Promise.resolve({
        code: 200,
        message: '',
        event: {
          event_type: '$identify',
        },
      }),
    });
    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
      referring_domain: 'amplitude.com',
    });

    const overrideMockConfig = {
      ...mockConfig,
      cookieOptions: {
        ...mockConfig.cookieOptions,
        domain: '.amplitude.com',
      },
    };
    const plugin = webAttributionPlugin();
    await plugin.setup?.(overrideMockConfig, amplitude);
    expect(track).toHaveBeenCalledTimes(0);
  });

  describe('execute', () => {
    test('should return same event', async () => {
      jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
      jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
        utm_source: 'amp-test',
      });
      const plugin = webAttributionPlugin({});
      const event = {
        event_properties: {
          page_location: '',
          page_path: '',
          page_title: '',
        },
        event_type: '[Amplitude] Page Viewed',
      };
      const result = await plugin.execute?.(event);

      expect(result).toBe(event);
    });
  });
});
