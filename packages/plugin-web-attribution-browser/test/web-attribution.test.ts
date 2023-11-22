import { createInstance } from '@amplitude/analytics-browser';
import { BASE_CAMPAIGN, CampaignParser, CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import * as webAttributionModule from '../src/web-attribution';
import * as helpers from '../src/helpers';
import { BrowserConfig, IdentifyEvent, LogLevel, SpecialEventType } from '@amplitude/analytics-types';
import { Logger, UUID } from '@amplitude/analytics-core';

const campaignEventWithUtmSource: IdentifyEvent = {
  event_type: SpecialEventType.IDENTIFY,
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
};

const webAttributionPlugin = webAttributionModule.webAttributionPlugin;

describe('webAttributionPlugin', () => {
  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
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
        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        const plugin = webAttributionPlugin();
        const overrideMockConfig = {
          ...mockConfig,
          sessionId: 1,
          cookieOptions: undefined,
        };
        await plugin.setup?.(overrideMockConfig, amplitude);
        expect(setSessionId).toHaveBeenCalledTimes(0);
        const newEvent = await plugin.execute?.({
          event_type: 'event_type',
          session_id: 1,
        });
        expect(newEvent?.user_properties).toEqual(campaignEventWithUtmSource.user_properties);
      });

      test('when a campaign changes and reset session id, without session events', async () => {
        const amplitude = createInstance();
        const setSessionId = jest.spyOn(amplitude, 'setSessionId');
        const track = jest.spyOn(amplitude, 'track').mockReturnValue({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });
        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        const overrideMockConfig: BrowserConfig = {
          ...mockConfig,

          // mocks a valid session to help assert
          // session restart
          sessionTimeout: 1000,
          lastEventTime: Date.now() - 100,
        };
        const plugin = webAttributionPlugin({
          resetSessionOnNewCampaign: true,
        });

        await plugin.setup?.(overrideMockConfig, amplitude);

        // assert that session was restarted
        expect(setSessionId).toHaveBeenCalledTimes(1);
        const newSessionId = setSessionId.mock.calls[0][0];

        // assert that campaign event ws tracked
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenNthCalledWith(1, {
          event_type: '$identify',
          user_properties: {
            ...campaignEventWithUtmSource.user_properties,
          },
          session_id: newSessionId,
        });

        const newEvent = await plugin.execute?.({
          event_type: 'event_type',
          session_id: newSessionId,
          user_properties: {
            // adding other user properties to test merge logic
            $add: {
              a: 1,
            },
          },
        });

        // assert next event seen was enriched with campaign event's user properties
        expect(newEvent?.event_type).toEqual('event_type');
        expect(newEvent?.user_properties).toEqual({
          ...campaignEventWithUtmSource.user_properties,
          $add: {
            a: 1,
          },
        });
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

    test('should enrich session_start event', async () => {
      const amplitude = createInstance();
      jest.spyOn(Date, 'now').mockReturnValue(Date.now());
      const sessionId = Date.now();
      const overrideMockConfig: BrowserConfig = {
        ...mockConfig,
        sessionId,
        defaultTracking: {
          sessions: true,
        },
      };
      jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
      jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
        utm_source: 'amp-test',
      });
      const plugin = webAttributionPlugin({
        resetSessionOnNewCampaign: true,
      });
      const event = {
        event_type: 'session_start',
        session_id: sessionId,
      };
      await plugin.setup?.(overrideMockConfig, amplitude);
      const result = await plugin.execute?.(event);

      expect(result).toBe(event);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result?.user_properties?.['$set']?.['utm_source']).toBe('amp-test');

      const duplicateCampaignEvent = {
        ...helpers.createCampaignEvent(BASE_CAMPAIGN, {}),
        session_id: sessionId,
      };
      const duplicateResult = await plugin.execute?.(duplicateCampaignEvent);
      expect(duplicateResult).toBe(null);
    });

    test('should not enrich session_start event if session_id is not present', async () => {
      const amplitude = createInstance();
      jest.spyOn(Date, 'now').mockReturnValue(Date.now());
      const sessionId = Date.now();
      const overrideMockConfig: BrowserConfig = {
        ...mockConfig,
        sessionId,
        defaultTracking: {
          sessions: true,
        },
      };
      jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
      jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
        utm_source: 'amp-test',
      });
      const plugin = webAttributionPlugin({
        resetSessionOnNewCampaign: true,
      });
      const event = {
        event_type: 'session_start',
      };
      await plugin.setup?.(overrideMockConfig, amplitude);
      const result = await plugin.execute?.(event);

      expect(result).toBe(event);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(result?.user_properties?.['$set']?.['utm_source']).toBe(undefined);
    });
  });
});
