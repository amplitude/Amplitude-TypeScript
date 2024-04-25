/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { UUID } from '@amplitude/analytics-core';
import { default as nock } from 'nock';
import { path, url as httpEndPoint, uuidPattern } from './constants';
import { success } from './responses';
import 'isomorphic-fetch';

describe('Web attribution', () => {
  const uuid: string = expect.stringMatching(uuidPattern) as string;
  const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
  const number = expect.any(Number) as number;
  const userAgent = expect.any(String) as string;
  const defaultTracking = {
    attribution: true,
    fileDownloads: false,
    formInteractions: false,
    pageViews: true,
    sessions: true,
  };

  let apiKey = '';
  let client = amplitude.createInstance();

  const event_upload_time = '2023-01-01T12:00:00:000Z';
  Date.prototype.toISOString = jest.fn(() => event_upload_time);

  beforeEach(() => {
    client = amplitude.createInstance();
    apiKey = UUID();
  });

  describe('Page load', () => {
    describe('in a new session', () => {
      afterEach(() => {
        cleanup();
      });

      test('should track all UTMs and referrers', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should track no campaign if no UTMs and no referrer', async () => {
        const url = new URL('https://www.example.com');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'EMPTY',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
                      referrer: '-',
                      referring_domain: '-',
                      rtd_cid: '-',
                      ttclid: '-',
                      twclid: '-',
                      utm_campaign: '-',
                      utm_source: '-',
                      utm_content: '-',
                      utm_id: '-',
                      utm_medium: '-',
                      utm_term: '-',
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should not track all UTMs and referrers if the referrer is excluded referrer', async () => {
        const excludedReferrer = 'https://www.google.com/';
        Object.defineProperty(document, 'referrer', { value: excludedReferrer, configurable: true });
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking: {
            ...defaultTracking,
            attribution: {
              excludeReferrers: ['www.google.com'],
            },
          },
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                    referrer: 'https://www.google.com/',
                    referring_domain: 'www.google.com',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });
    });

    describe('during a session', () => {
      afterEach(() => {
        cleanup();
      });

      test('should not fire campaign identify event for direct traffic', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // refresh during the session.
        const directUrl = new URL('https://www.example.com/home');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: directUrl.hostname,
            href: directUrl.href,
            pathname: directUrl.pathname,
            search: directUrl.search,
          },
          writable: true,
        });

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_properties: {
                    '[Amplitude] Page Counter': 2,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/home',
                    '[Amplitude] Page Path': '/home',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/home',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should track all UTMs and referrers if any campaign changed and not direct traffic', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // mock refresh during the session with updated campaign change.
        const newCampaignURL = new URL(
          'https://www.example.com/?utm_source=second_utm_source&utm_content=test_utm_content',
        );
        Object.defineProperty(window, 'location', {
          value: {
            hostname: newCampaignURL.hostname,
            href: newCampaignURL.href,
            pathname: newCampaignURL.pathname,
            search: newCampaignURL.search,
          },
          writable: true,
        });

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'second_utm_source',
                      utm_content: 'test_utm_content',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'test_utm_content',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'second_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
                      referrer: '-',
                      referring_domain: '-',
                      rtd_cid: '-',
                      ttclid: '-',
                      twclid: '-',
                      utm_campaign: '-',
                      utm_id: '-',
                      utm_medium: '-',
                      utm_term: '-',
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 4,
                  event_properties: {
                    '[Amplitude] Page Counter': 2,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location':
                      'https://www.example.com/?utm_source=second_utm_source&utm_content=test_utm_content',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'second_utm_source',
                    utm_content: 'test_utm_content',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should start a new session with resetSessionCampaign enable and track campaign updates', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking: {
            ...defaultTracking,
            attribution: {
              resetSessionOnNewCampaign: true,
            },
          },
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // refresh during the session.
        const directUrl = new URL('https://www.example.com/?utm_content=test_utm_content');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: directUrl.hostname,
            href: directUrl.href,
            pathname: directUrl.pathname,
            search: directUrl.search,
          },
          writable: true,
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        setTimeout(async () => {
          await client.init(apiKey, 'user1@amplitude.com', {
            deviceId: UUID(),
            defaultTracking: {
              ...defaultTracking,
              attribution: {
                resetSessionOnNewCampaign: true,
              },
            },
            sessionTimeout: 500,
            flushIntervalMillis: 3000,
          }).promise;
        }, 100);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: 'session_end',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 4,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_content: 'test_utm_content',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'test_utm_content',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'EMPTY',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
                      referrer: '-',
                      referring_domain: '-',
                      rtd_cid: '-',
                      ttclid: '-',
                      twclid: '-',
                      utm_campaign: '-',
                      utm_id: '-',
                      utm_medium: '-',
                      utm_source: '-',
                      utm_term: '-',
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 5,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 6,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_content=test_utm_content',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_content: 'test_utm_content',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });
    });
  });

  describe('process event', () => {
    describe('in a new session', () => {
      afterEach(() => {
        cleanup();
      });

      test('should track all UTMs and referrers while processing any event', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // update the url and fire the first event after session timeout
        setTimeout(() => {
          const url = new URL('https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content');
          Object.defineProperty(window, 'location', {
            value: {
              hostname: url.hostname,
              href: url.href,
              pathname: url.pathname,
              search: url.search,
            },
            writable: true,
          });

          client.track('test event after session timeout');
        }, 600);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: 'session_end',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 4,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'second_utm_source',
                      utm_content: 'test_utm_content',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'test_utm_content',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'second_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
                      referrer: '-',
                      referring_domain: '-',
                      rtd_cid: '-',
                      ttclid: '-',
                      twclid: '-',
                      utm_campaign: '-',
                      utm_id: '-',
                      utm_medium: '-',
                      utm_term: '-',
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 5,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 6,
                  event_type: 'test event after session timeout',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should not track UTMs and referrers if the referrer is excluded referrer', async () => {
        const excludedReferrer = 'https://www.google.com/';
        Object.defineProperty(document, 'referrer', { value: excludedReferrer, configurable: true });
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking: {
            ...defaultTracking,
            attribution: {
              excludeReferrers: ['www.google.com'],
            },
            sessions: true,
          },
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // update the url and fire the first event after session timeout
        setTimeout(() => {
          const url = new URL('https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content');
          Object.defineProperty(window, 'location', {
            value: {
              hostname: url.hostname,
              href: url.href,
              pathname: url.pathname,
              search: url.search,
            },
            writable: true,
          });

          client.track('test event after session timeout');
        }, 600);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                    referrer: 'https://www.google.com/',
                    referring_domain: 'www.google.com',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_type: 'session_end',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 4,
                  event_type: 'test event after session timeout',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });
    });

    describe('during a session', () => {
      afterEach(() => {
        cleanup();
      });

      test('should not track updated campaign during', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // update the url and fire the first event during the same session without refreshing the page
        const newCampaignURL = new URL(
          'https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content',
        );
        Object.defineProperty(window, 'location', {
          value: {
            hostname: newCampaignURL.hostname,
            href: newCampaignURL.href,
            pathname: newCampaignURL.pathname,
            search: newCampaignURL.search,
          },
          writable: true,
        });

        client.track('test event after session timeout');

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: 'test event after session timeout',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });

      test('should not track campaign with resetSessionCampaign enable', async () => {
        const url = new URL('https://www.example.com?utm_source=test_utm_source');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: url.hostname,
            href: url.href,
            pathname: url.pathname,
            search: url.search,
          },
          writable: true,
        });

        let payload: any = undefined;
        const scope = nock(httpEndPoint)
          .post(path, (body: Record<string, any>) => {
            payload = body;
            return true;
          })
          .reply(200, success);

        await client.init(apiKey, 'user1@amplitude.com', {
          deviceId: UUID(),
          defaultTracking: {
            ...defaultTracking,
            attribution: {
              resetSessionOnNewCampaign: true,
            },
            sessions: true,
          },
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // refresh during the session.
        const directUrl = new URL('https://www.example.com/?utm_content=test_utm_content');
        Object.defineProperty(window, 'location', {
          value: {
            hostname: directUrl.hostname,
            href: directUrl.href,
            pathname: directUrl.pathname,
            search: directUrl.search,
          },
          writable: true,
        });

        client.track('test event in same session');

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                {
                  device_id: uuid,
                  event_id: 0,
                  event_type: '$identify',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                  user_properties: {
                    $set: {
                      utm_source: 'test_utm_source',
                    },
                    $setOnce: {
                      initial_dclid: 'EMPTY',
                      initial_fbclid: 'EMPTY',
                      initial_gbraid: 'EMPTY',
                      initial_gclid: 'EMPTY',
                      initial_ko_click_id: 'EMPTY',
                      initial_li_fat_id: 'EMPTY',
                      initial_msclkid: 'EMPTY',
                      initial_referrer: 'EMPTY',
                      initial_referring_domain: 'EMPTY',
                      initial_rtd_cid: 'EMPTY',
                      initial_ttclid: 'EMPTY',
                      initial_twclid: 'EMPTY',
                      initial_utm_campaign: 'EMPTY',
                      initial_utm_content: 'EMPTY',
                      initial_utm_id: 'EMPTY',
                      initial_utm_medium: 'EMPTY',
                      initial_utm_source: 'test_utm_source',
                      initial_utm_term: 'EMPTY',
                      initial_wbraid: 'EMPTY',
                    },
                    $unset: {
                      dclid: '-',
                      fbclid: '-',
                      gbraid: '-',
                      gclid: '-',
                      ko_click_id: '-',
                      li_fat_id: '-',
                      msclkid: '-',
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
                      wbraid: '-',
                    },
                  },
                },
                {
                  device_id: uuid,
                  event_id: 1,
                  event_type: 'session_start',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 2,
                  event_properties: {
                    '[Amplitude] Page Counter': 1,
                    '[Amplitude] Page Domain': 'www.example.com',
                    '[Amplitude] Page Location': 'https://www.example.com/?utm_source=test_utm_source',
                    '[Amplitude] Page Path': '/',
                    '[Amplitude] Page Title': '',
                    '[Amplitude] Page URL': 'https://www.example.com/',
                    utm_source: 'test_utm_source',
                  },
                  event_type: '[Amplitude] Page Viewed',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
                {
                  device_id: uuid,
                  event_id: 3,
                  event_type: 'test event in same session',
                  insert_id: uuid,
                  ip: '$remote',
                  language: 'en-US',
                  library,
                  partner_id: undefined,
                  plan: undefined,
                  platform: 'Web',
                  session_id: number,
                  time: number,
                  user_agent: userAgent,
                  user_id: 'user1@amplitude.com',
                },
              ],
              options: {
                min_id_length: undefined,
              },
            });
            scope.done();
            resolve();
          }, 4000);
        });
      });
    });
  });

  const cleanup = () => {
    // clean up cookies
    document.cookie = `amp_${apiKey.substring(0, 6)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_MKTG_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  };
});
