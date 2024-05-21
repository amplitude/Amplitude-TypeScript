/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { default as nock } from 'nock';
//import { success } from './responses';
import 'isomorphic-fetch';
import { path, url, uuidPattern } from './constants';
import { UUID } from '@amplitude/analytics-core';

describe('integration', () => {
  const uuid: string = expect.stringMatching(uuidPattern) as string;
  const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
  const number = expect.any(Number) as number;
  const userAgent = expect.any(String) as string;
  const defaultTracking = {
    attribution: false,
    fileDownloads: false,
    formInteractions: false,
    pageViews: false,
    sessions: false,
  };

  let apiKey = '';
  let client = amplitude.createInstance();

  const event_upload_time = '2023-01-01T12:00:00:000Z';
  Date.prototype.toISOString = jest.fn(() => event_upload_time);

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
  });

  beforeEach(() => {
    client = amplitude.createInstance();
    apiKey = UUID();
    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
  });

  afterEach(() => {
    // clean up cookies
    document.cookie = `amp_${apiKey.substring(0, 6)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
    document.cookie = `AMP_MKTG_${apiKey.substring(0, 10)}=null; expires=1 Jan 1970 00:00:00 GMT`;
  });

  describe('track', () => {
    test('should handle 429 error with throttledEvents', async () => {
      const first = nock(url)
        .post(path)
        .reply(429, {
          code: 429,
          error: 'Too many requests for some devices and users',
          throttled_events: [0],
        });
      //const second = nock(url).post(path).reply(200, success);

      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
      }).promise;
      const response = await Promise.all([
        client.track('test event 1').promise,
        client.track('test event 2').promise,
        client.track('test event 3').promise,
      ]);

      console.log(response);
      await client.track('test event 4').promise;

      setTimeout(() => {
        amplitude.flush();
      }, 4000);

      expect(response[0].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 1',
        event_id: 0,
        library: library,
        user_agent: userAgent,
      });

      expect(response[0].code).toBe(429);
      expect(response[0].message).toBe('Too many requests for some devices and users');

      first.done();
      ////second.done();
    });
  });
});
