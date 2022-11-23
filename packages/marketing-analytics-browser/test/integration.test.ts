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
  const opts = {
    trackingOptions: {
      deviceModel: false,
    },
  };

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
    client.init('API_KEY', undefined, { ...opts });

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
                  initial_utm_source: 'EMPTY',
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
      ...opts,
      pageViewTracking: {
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
                page_domain: 'localhost',
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
                page_url: 'http://localhost/',
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
                  initial_utm_source: 'EMPTY',
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
      ...opts,
      attribution: {
        disabled: true,
      },
      pageViewTracking: true,
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
                page_domain: 'localhost',
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
                page_url: 'http://localhost/',
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
      ...opts,
      pageViewTracking: true,
    });

    return new Promise<void>((resolve) => {
      scope.on('replied', () => {
        expect(requestBody).toEqual({
          api_key: 'API_KEY',
          events: [
            // NOTE: We want `$identify` event first, before `Page View` event
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
                  initial_utm_source: 'EMPTY',
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
                  utm_source: '-',
                  utm_term: '-',
                },
              },
            },
            // NOTE: We want `$identify` event first, before `Page View` event
            {
              device_id: expectString,
              event_id: 1,
              event_properties: {
                page_domain: 'localhost',
                page_location: 'http://localhost/',
                page_path: '/',
                page_title: '',
                page_url: 'http://localhost/',
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
});
