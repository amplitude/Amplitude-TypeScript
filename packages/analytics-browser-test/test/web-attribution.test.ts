/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { UUID } from '@amplitude/analytics-core';
import { default as nock } from 'nock';
import { path, url as httpEndPoint } from './constants';
import { success } from './responses';
import 'isomorphic-fetch';
import {
  generateEvent,
  generateAttributionEvent,
  generateSessionStartEvent,
  generateSessionEndEvent,
  generatePageViewEvent,
  navigateTo,
} from './helpers';

describe('Web attribution', () => {
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
      let eventId = -1;
      beforeEach(() => {
        eventId = -1;
      });

      afterEach(() => {
        cleanup();
      });

      test('should track all UTMs and referrers', async () => {
        const referrer = 'https://www.google.com/';
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url, referrer);

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
                generateAttributionEvent(++eventId, url, referrer),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url, referrer),
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

      test('should track EMPTY campaign if no UTMs and no referrer', async () => {
        const url = 'https://www.example.com';
        navigateTo(url);

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
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
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
        const referrer = 'https://www.google.com/';
        const referrerDomain = 'www.google.com';
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url, referrer);

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
              excludeReferrers: [referrerDomain],
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
              events: [generateSessionStartEvent(++eventId), generatePageViewEvent(++eventId, 1, url, referrer)],
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
      let eventId = -1;
      beforeEach(() => {
        eventId = -1;
      });

      afterEach(() => {
        cleanup();
      });

      test('should not fire campaign identify event for direct traffic', async () => {
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // refresh during the session.
        const directUrl = 'https://www.example.com/home';
        navigateTo(directUrl);

        await new Promise((resolve) => setTimeout(resolve, 100));

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
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generatePageViewEvent(++eventId, 2, directUrl),
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
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
          defaultTracking,
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // mock refresh during the session with updated campaign change.
        const newCampaignURL = 'https://www.example.com/?utm_source=second_utm_source&utm_content=test_utm_content';
        navigateTo(newCampaignURL);

        await new Promise((resolve) => setTimeout(resolve, 100));

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
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generateAttributionEvent(++eventId, newCampaignURL),
                generatePageViewEvent(++eventId, 2, newCampaignURL),
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
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
        const directUrl = 'https://www.example.com/?utm_content=test_utm_content';
        navigateTo(directUrl);

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
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generateSessionEndEvent(++eventId),
                generateAttributionEvent(++eventId, directUrl),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, directUrl),
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
      let eventId = -1;
      beforeEach(() => {
        eventId = -1;
      });

      afterEach(() => {
        cleanup();
      });

      //The SPA won't reload the page when redirected. We don't track campaign updates without reinitializing the SDK (reloading the page) for now.
      test('Not track campaign change while processing any event', async () => {
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
        const newCampaignURL = 'https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content';
        setTimeout(() => {
          navigateTo(newCampaignURL);

          client.track('test event after session timeout');
        }, 600);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generateSessionEndEvent(++eventId),
                generateSessionStartEvent(++eventId),
                generateEvent(++eventId, 'test event after session timeout'),
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
        const referrer = 'https://www.google.com/';
        const referring_domain = 'www.google.com';
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url, referrer);

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
              excludeReferrers: [referring_domain],
            },
            sessions: true,
          },
          sessionTimeout: 500,
          flushIntervalMillis: 3000,
        }).promise;

        // update the url and fire the first event after session timeout
        const newCampaignURL = 'https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content';
        setTimeout(() => {
          navigateTo(newCampaignURL);

          client.track('test event after session timeout');
        }, 600);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url, referrer),
                generateSessionEndEvent(++eventId),
                generateSessionStartEvent(++eventId),
                generateEvent(++eventId, 'test event after session timeout'),
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

    // Specific tests for an SPA. The SPA won't reload the page when redirected. We don't track campaign updates without reinitializing the SDK (reloading the page).
    describe('during a session', () => {
      let eventId = -1;
      beforeEach(() => {
        eventId = -1;
      });

      afterEach(() => {
        cleanup();
      });

      test('should not track updated campaign', async () => {
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
        const newCampaignURL = 'https://www.example.com?utm_source=second_utm_source&utm_content=test_utm_content';
        navigateTo(newCampaignURL);

        client.track('test event in the same session');

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generateEvent(++eventId, 'test event in the same session'),
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
        const url = 'https://www.example.com?utm_source=test_utm_source';
        navigateTo(url);

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
        const directUrl = 'https://www.example.com/?utm_content=test_utm_content';
        navigateTo(directUrl);

        client.track('test event in same session');

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                generateAttributionEvent(++eventId, url),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url),
                generateEvent(++eventId, 'test event in same session'),
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

      test('should not drop campaign without reinitializing the SDK after unsetting the referrer', async () => {
        const url = 'https://www.example.com?utm_source=test_utm_source';
        const initReferrer = 'https://www.test.com/';
        navigateTo(url, initReferrer);
        expect(document.referrer).toEqual(initReferrer);

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

        // Unset the referrer after first hit
        Object.defineProperty(document, 'referrer', { value: '', configurable: true });
        expect(document.referrer).toEqual('');

        // Update the url to drop all UTM to mock SPA redirect during the same session without refreshing the page
        // Fire page view event in current session
        const newURL = 'https://www.example.com';
        navigateTo(newURL);
        window.history.pushState(undefined, newURL);

        return new Promise<void>((resolve) => {
          setTimeout(() => {
            expect(payload).toEqual({
              api_key: apiKey,
              client_upload_time: event_upload_time,
              events: [
                generateAttributionEvent(++eventId, url, initReferrer),
                generateSessionStartEvent(++eventId),
                generatePageViewEvent(++eventId, 1, url, initReferrer),
                generatePageViewEvent(++eventId, 2, newURL),
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
