import { createInstance } from '../src';
import { default as nock } from 'nock';
import 'isomorphic-fetch';

const setCookie = (key: string, value: Record<string, string | number | boolean>) => {
  document.cookie = `${key}=${btoa(encodeURIComponent(JSON.stringify(value)))}`;
};

const unsetCookie = (key: string) => {
  document.cookie = `${key}=null; expires=-1`;
};

describe('e2e', () => {
  const url = 'https://api2.amplitude.com';
  const path = '/2/httpapi';
  const success = {
    code: 200,
    events_ingested: 1,
    payload_size_bytes: 50,
    server_upload_time: 1396381378123,
  };
  const expectString = expect.any(String) as string;
  const expectLibrary = expect.stringMatching(/^amplitude-ma-ts\/.+/) as string;
  const expectNumber = expect.any(Number) as number;

  beforeEach(() => {
    unsetCookie('AMP_API_KEY');
    unsetCookie('AMP_MKTG_API_KEY');
  });

  test('should track attribution', () => {
    setCookie('AMP_MKTG_API_KEY', {
      utm_campaign: '123',
    });

    let requestBody: Record<string, any> = {};
    const scope = nock(url)
      .post(path, (body: Record<string, any>) => {
        requestBody = body;
        return true;
      })
      .reply(200, success);

    const client = createInstance();
    client.init('API_KEY', undefined);

    return new Promise<void>((resolve) => {
      scope.on('replied', () => {
        expect(requestBody).toEqual({
          api_key: 'API_KEY',
          events: [
            {
              device_id: expectString,
              event_id: 0,
              event_type: '$identify',
              insert_id: expectString,
              ip: '$remote',
              language: 'en-US',
              library: expectLibrary,
              os_name: 'WebKit',
              os_version: '537.36',
              platform: 'Web',
              session_id: expectNumber,
              time: expectNumber,
              user_properties: {
                $setOnce: {
                  initial_fbclid: 'EMPTY',
                  initial_gclid: 'EMPTY',
                  initial_referrer: 'EMPTY',
                  initial_referring_domain: 'EMPTY',
                  initial_utm_campaign: 'EMPTY',
                  initial_utm_content: 'EMPTY',
                  initial_utm_medium: 'EMPTY',
                  initial_utm_source: 'EMPTY',
                  initial_utm_term: 'EMPTY',
                },
                $unset: {
                  fbclid: '-',
                  gclid: '-',
                  referrer: '-',
                  referring_domain: '-',
                  utm_campaign: '-',
                  utm_content: '-',
                  utm_medium: '-',
                  utm_source: '-',
                  utm_term: '-',
                },
              },
            },
          ],
          options: {},
        });
        scope.done();
        resolve();
      });
    });
  });

  test('should track page view on attribution', () => {
    setCookie('AMP_MKTG_API_KEY', {
      utm_campaign: '123',
    });

    let requestBody: Record<string, any> = {};
    const scope = nock(url)
      .post(path, (body: Record<string, any>) => {
        requestBody = body;
        return true;
      })
      .reply(200, success);

    const client = createInstance();
    client.init('API_KEY', undefined, {
      trackPageViews: {
        trackOn: 'attribution',
      },
    });

    return new Promise<void>((resolve) => {
      scope.on('replied', () => {
        expect(requestBody).toEqual({
          api_key: 'API_KEY',
          events: [
            {
              device_id: expectString,
              event_id: 0,
              event_properties: {
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
              },
              event_type: 'Page View',
              insert_id: expectString,
              ip: '$remote',
              language: 'en-US',
              library: expectLibrary,
              os_name: 'WebKit',
              os_version: '537.36',
              platform: 'Web',
              session_id: expectNumber,
              time: expectNumber,
              user_properties: {
                $setOnce: {
                  initial_fbclid: 'EMPTY',
                  initial_gclid: 'EMPTY',
                  initial_referrer: 'EMPTY',
                  initial_referring_domain: 'EMPTY',
                  initial_utm_campaign: 'EMPTY',
                  initial_utm_content: 'EMPTY',
                  initial_utm_medium: 'EMPTY',
                  initial_utm_source: 'EMPTY',
                  initial_utm_term: 'EMPTY',
                },
                $unset: {
                  fbclid: '-',
                  gclid: '-',
                  referrer: '-',
                  referring_domain: '-',
                  utm_campaign: '-',
                  utm_content: '-',
                  utm_medium: '-',
                  utm_source: '-',
                  utm_term: '-',
                },
              },
            },
          ],
          options: {},
        });
        scope.done();
        resolve();
      });
    });
  });

  test('should track page view on load', () => {
    setCookie('AMP_MKTG_API_KEY', {
      utm_campaign: '123',
    });

    let requestBody: Record<string, any> = {};
    const scope = nock(url)
      .post(path, (body: Record<string, any>) => {
        requestBody = body;
        return true;
      })
      .reply(200, success);

    const client = createInstance();
    client.init('API_KEY', undefined, {
      attribution: {
        disabled: true,
      },
      trackPageViews: true,
    });

    return new Promise<void>((resolve) => {
      scope.on('replied', () => {
        expect(requestBody).toEqual({
          api_key: 'API_KEY',
          events: [
            {
              device_id: expectString,
              event_id: 0,
              event_properties: {
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
              },
              event_type: 'Page View',
              insert_id: expectString,
              ip: '$remote',
              language: 'en-US',
              library: expectLibrary,
              os_name: 'WebKit',
              os_version: '537.36',
              platform: 'Web',
              session_id: expectNumber,
              time: expectNumber,
            },
          ],
          options: {},
        });
        scope.done();
        resolve();
      });
    });
  });

  test('should track attribution and page view on load (separately)', () => {
    setCookie('AMP_MKTG_API_KEY', {
      utm_campaign: '123',
    });

    let requestBody: Record<string, any> = {};
    const scope = nock(url)
      .post(path, (body: Record<string, any>) => {
        requestBody = body;
        return true;
      })
      .reply(200, success);

    const client = createInstance();
    client.init('API_KEY', undefined, {
      trackPageViews: true,
    });

    return new Promise<void>((resolve) => {
      scope.on('replied', () => {
        expect(requestBody).toEqual({
          api_key: 'API_KEY',
          events: [
            {
              device_id: expectString,
              event_id: 0,
              event_properties: {
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
              },
              event_type: 'Page View',
              insert_id: expectString,
              ip: '$remote',
              language: 'en-US',
              library: expectLibrary,
              os_name: 'WebKit',
              os_version: '537.36',
              platform: 'Web',
              session_id: expectNumber,
              time: expectNumber,
            },
            {
              device_id: expectString,
              event_id: 1,
              event_type: '$identify',
              insert_id: expectString,
              ip: '$remote',
              language: 'en-US',
              library: expectLibrary,
              os_name: 'WebKit',
              os_version: '537.36',
              platform: 'Web',
              session_id: expectNumber,
              time: expectNumber,
              user_properties: {
                $setOnce: {
                  initial_fbclid: 'EMPTY',
                  initial_gclid: 'EMPTY',
                  initial_referrer: 'EMPTY',
                  initial_referring_domain: 'EMPTY',
                  initial_utm_campaign: 'EMPTY',
                  initial_utm_content: 'EMPTY',
                  initial_utm_medium: 'EMPTY',
                  initial_utm_source: 'EMPTY',
                  initial_utm_term: 'EMPTY',
                },
                $unset: {
                  fbclid: '-',
                  gclid: '-',
                  referrer: '-',
                  referring_domain: '-',
                  utm_campaign: '-',
                  utm_content: '-',
                  utm_medium: '-',
                  utm_source: '-',
                  utm_term: '-',
                },
              },
            },
          ],
          options: {},
        });
        scope.done();
        resolve();
      });
    });
  });
});
