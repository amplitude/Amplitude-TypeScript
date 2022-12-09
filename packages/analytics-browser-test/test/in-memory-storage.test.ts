import { createInstance } from '@amplitude/analytics-browser';
import { MemoryStorage } from '@amplitude/analytics-core';
import { default as nock } from 'nock';
import { path, url } from './constants';
import { success } from './responses';
import 'isomorphic-fetch';

describe('Storage options', () => {
  afterEach(() => {
    // clean up storage
    document.cookie = 'AMP_API_KEY=null; expires=1 Jan 1970 00:00:00 GMT';
    window.localStorage.clear();
  });

  test('should use default storage', async () => {
    const scope = nock(url).post(path).reply(200, success);

    const amplitude = createInstance();
    await amplitude.init('API_KEY', undefined, {
      attribution: {
        disabled: true,
      },
    }).promise;

    await amplitude.track('Event').promise;

    /**
     * cookies are the default storage option for user session
     * asserts that cookie storage was used
     */
    expect(document.cookie).toContain('AMP_API_KEY=');
    /**
     * local storage is the default storage option for unsent events
     * asserts that local storage was used
     */
    expect(window.localStorage.key(0)).toBe('AMP_unsent_API_KEY');

    scope.done();
  });

  test('should use local storage', async () => {
    const scope = nock(url).post(path).reply(200, success);

    const amplitude = createInstance();
    await amplitude.init('API_KEY', undefined, {
      attribution: {
        disabled: true,
      },
      disableCookies: true,
    }).promise;

    await amplitude.track('Event').promise;

    /**
     * cookies are disabled
     * asserts that cookie storage was not used
     */
    expect(document.cookie).toBe('');
    /**
     * with `disableCookies: true`, user session is stored in local storage
     * asserts that local storage is used for use session and unsent events
     */
    expect(window.localStorage.key(0)).toContain('AMP_API_KEY');
    expect(window.localStorage.key(1)).toBe('AMP_unsent_API_KEY');
    expect(window.localStorage.length).toBe(2);

    scope.done();
  });

  test('should use memory storage', async () => {
    const scope = nock(url).post(path).reply(200, success);

    const amplitude = createInstance();
    await amplitude.init('API_KEY', undefined, {
      attribution: {
        disabled: true,
      },
      cookieStorage: new MemoryStorage(),
      storageProvider: new MemoryStorage(),
    }).promise;

    await amplitude.track('Event').promise;

    /**
     * cookieStorage is set to new MemoryStorage()
     * asserts that cookie storage is not used
     */
    expect(document.cookie).toBe('');
    /**
     * storageProvider is set to new MemoryStorage()
     * asserts that local storage is not used
     */
    expect(window.localStorage.length).toBe(0);

    scope.done();
  });
});
