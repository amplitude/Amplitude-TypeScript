import { createInstance } from '@amplitude/analytics-browser';
import { BASE_CAMPAIGN, CampaignParser } from '@amplitude/analytics-client-common';
import { webAttributionPlugin } from '../src/web-attribution';
import * as helpers from '../src/helpers';
import { Logger } from '@amplitude/analytics-types';
import { Config } from '@amplitude/analytics-core';

describe('webAttributionPlugin', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';

  describe('setup', () => {
    let instance = createInstance();

    beforeEach(async () => {
      instance = createInstance();
      await instance.init(API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
      }).promise;
    });

    test('should handle expected BrowserClient, but got Options', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        error: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };

      const plugin = webAttributionPlugin({
        excludeReferrers: [],
      });
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenCalledWith(
        `Argument of type 'Options' is not assignable to parameter of type 'BrowserClient'.`,
      );
    });

    test('should handle expected BrowserClient, but got undefined', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        error: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };

      const plugin = webAttributionPlugin();
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenCalledWith(
        `Argument of type 'undefined' is not assignable to parameter of type 'BrowserClient'.`,
      );
    });

    test('should handle disabled plugin', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };

      const plugin = webAttributionPlugin({
        disabled: true,
      });
      await plugin.setup(config as Config, instance);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenCalledWith(
        `@amplitude/plugin-web-attribution-browser is disabled. Attribution is not tracked.`,
      );
    });

    describe('should send an identify event', () => {
      test('when a campaign changes', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
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

        await instance.add(webAttributionPlugin(instance)).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        const sessionId = instance.getSessionId();

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
              initial_msclkid: 'EMPTY',
              initial_wbraid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
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
              msclkid: '-',
              wbraid: '-',
              referrer: '-',
              referring_domain: '-',
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
        expect(sessionId).toBe(sessionId);
      });

      test('when a campaign changes and reset session id', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
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

        const sessionId = instance.getSessionId();

        await instance.add(
          webAttributionPlugin(instance, {
            resetSessionOnNewCampaign: true,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

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
              initial_msclkid: 'EMPTY',
              initial_wbraid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
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
              msclkid: '-',
              wbraid: '-',
              referrer: '-',
              referring_domain: '-',
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
        expect(instance.getSessionId()).not.toBe(sessionId);
      });
    });

    describe('should not send an identify event', () => {
      test('when a campaign does not change', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(false);
        jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
          ...BASE_CAMPAIGN,
          utm_source: 'amp-test',
        });

        await instance.add(webAttributionPlugin(instance)).promise;

        const loggerProvider = {
          enable: jest.fn(),
          disable: jest.fn(),
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn(),
        };

        await instance.init(API_KEY, USER_ID, {
          loggerProvider,
        }).promise;

        expect(track).toHaveBeenCalledTimes(0);
        expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('execute', () => {
    test('should return same event', async () => {
      const instance = createInstance();

      jest.spyOn(helpers, 'isNewCampaign').mockReturnValue(true);
      jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
        utm_source: 'amp-test',
      });

      const plugin = webAttributionPlugin(instance, {});
      const event = {
        event_properties: {
          page_location: '',
          page_path: '',
          page_title: '',
        },
        event_type: 'Page View',
      };
      const result = await plugin.execute(event);

      expect(result).toBe(event);
    });
  });
});
