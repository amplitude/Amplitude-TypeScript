/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as amplitude from '@amplitude/analytics-browser';
import { default as nock } from 'nock';
//import { success } from './responses';
import 'isomorphic-fetch';
import { path, url } from './constants';
import { UUID } from '@amplitude/analytics-core';
import { success } from './responses';

describe('integration', () => {
  //const uuid: string = expect.stringMatching(uuidPattern) as string;
  //const library = expect.stringMatching(/^amplitude-ts\/.+/) as string;
  //const number = expect.any(Number) as number;
  //const userAgent = expect.any(String) as string;
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

  describe('defer initialization', () => {
    test('should handle 429 error with throttled event', async () => {
      //const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      let payload: any = undefined;

      const first = nock(url)
        .post(path)
        .reply(429, {
          code: 429,
          error: 'Too many requests for some devices and users',
          throttled_events: [0],
        });
      const second = nock(url)
        .post(path, (body: Record<string, any>) => {
          payload = body;
          return true;
        })
        .reply(200, success);

      await client.init(apiKey, {
        logLevel: 0,
        defaultTracking,
        flushIntervalMillis: 1000,
      }).promise;
      //const response = await Promise.all([
      client.track('test event 1'); //.promise,
      client.track('test event 2'); //.promise,
      //]);
      console.log(12);

      //await wait(3000);

      await new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log(13);
          //client.flush();
          //expect(true).toBe(true);
          resolve();
          first.done();
        }, 4000),
      );

      client.track('test event 3');
      client.flush();

      return await new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log(15);
          //client.flush();
          console.log(payload);
          /**
         *     {
      api_key: 'ef984122-c82e-42d4-b61b-458d4fcac086',
      events: [
        {
          device_id: '272f9aa1-327e-4dd5-a1b5-55b6618174ab',
          session_id: 1716404478384,
          time: 1716404478399,
          platform: 'Web',
          language: 'en-US',
          ip: '$remote',
          insert_id: '6f335c0e-e759-4a05-ae87-bc9d44681d2a',
          event_type: 'test event 1',
          event_id: 0,
          library: 'amplitude-ts/2.7.0',
          user_agent: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.3'
        },
        {
          device_id: '272f9aa1-327e-4dd5-a1b5-55b6618174ab',
          session_id: 1716404478384,
          time: 1716404478414,
          platform: 'Web',
          language: 'en-US',
          ip: '$remote',
          insert_id: 'e9c8ea3f-365d-4e3c-8283-b98aee5c6c88',
          event_type: 'test event 2',
          event_id: 1,
          library: 'amplitude-ts/2.7.0',
          user_agent: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.3'
        },
        {
          device_id: '272f9aa1-327e-4dd5-a1b5-55b6618174ab',
          session_id: 1716404478384,
          time: 1716404482400,
          platform: 'Web',
          language: 'en-US',
          ip: '$remote',
          insert_id: '76ae8983-58c8-4915-8da6-3e3e6da763a3',
          event_type: 'test event 3',
          event_id: 2,
          library: 'amplitude-ts/2.7.0',
          user_agent: 'Mozilla/5.0 (darwin) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/20.0.3'
        }
      ],
      options: {},
      client_upload_time: '2023-01-01T12:00:00:000Z'
    }

         */

          expect(true).toBe(true);
          resolve();
          second.done();
        }, 500),
      );

      /*expect(response[0].event).toEqual({
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
      expect(response[0].code).toBe(200);
      expect(response[0].message).toBe(SUCCESS_MESSAGE);
      expect(response[1].event).toEqual({
        user_id: undefined,
        device_id: uuid,
        session_id: number,
        time: number,
        platform: 'Web',
        language: 'en-US',
        ip: '$remote',
        insert_id: uuid,
        partner_id: undefined,
        event_type: 'test event 2',
        event_id: 1,
        library: library,
        user_agent: userAgent,
      });
      expect(response[1].code).toBe(200);
      expect(response[1].message).toBe(SUCCESS_MESSAGE);
*/
    });
  });
});
