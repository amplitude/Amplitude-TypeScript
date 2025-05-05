import { PrivacyConfig } from '../src/config/types';
import {
  MASK_TEXT_CLASS,
  SESSION_REPLAY_EU_URL,
  SESSION_REPLAY_SERVER_URL,
  SESSION_REPLAY_STAGING_URL,
  UNMASK_TEXT_CLASS,
} from '../src/constants';
import { ServerZone } from '@amplitude/analytics-core';
import { generateHashCode, getServerUrl, getStorageSize, isSessionInSample, maskFn } from '../src/helpers';
import * as AnalyticsCore from '@amplitude/analytics-core';
import { getPageUrl } from '../src/helpers';
import { UGCFilterRule } from '../src/config/types';

describe('SessionReplayPlugin helpers', () => {
  describe('maskFn -- input', () => {
    test('should default to medium on unknown mask level', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = maskFn('input', { defaultMaskLevel: 'lightxx' } as any)('some text', null);
      expect(result).toEqual('**** ****');
    });

    test('should not mask on null element', () => {
      const result = maskFn('input', { defaultMaskLevel: 'light' })('some text', null);
      expect(result).toEqual('some text');
    });

    test('masking takes priority over code unmask', () => {
      const htmlElement = document.createElement('input');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('input', { maskSelector: ['.' + UNMASK_TEXT_CLASS], unmaskSelector: [] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('**** ****');
    });
    test('should mask on default config', () => {
      const htmlElement = document.createElement('div');
      const result = maskFn('input', { maskSelector: [], unmaskSelector: [] })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask instead of unmask for certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('mask-this');
      const result = maskFn('input', {
        defaultMaskLevel: 'light',
        maskSelector: ['.mask-this'],
        unmaskSelector: ['.mask-this'],
      })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should specifically mask certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('mask-this');
      const result = maskFn('input', { defaultMaskLevel: 'light', maskSelector: ['.mask-this'] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('**** ****');
    });
    test('should specifically unmask certain selectors', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('unmask-this');
      const result = maskFn('input', { defaultMaskLevel: 'conservative', unmaskSelector: ['.unmask-this'] })(
        'some text',
        htmlElement,
      );
      expect(result).toEqual('some text');
    });
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('input')('some text', htmlElement);
      expect(result).toEqual('some text');
    });
    test('should mask any other element', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add('another-class');
      const result = maskFn('input')('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask on conservative level', () => {
      const htmlElement = document.createElement('input');
      const result = maskFn('input', { defaultMaskLevel: 'conservative' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });

    describe('light mask level', () => {
      const privacyConfig: PrivacyConfig = { defaultMaskLevel: 'light' };

      test.each([
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'password';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'email';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'hidden';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.autocomplete = 'cc-number';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'tel';
            return element;
          },
          masked: true,
        },
        {
          el: (element: HTMLInputElement): HTMLInputElement => {
            element.type = 'search';
            return element;
          },
          masked: false,
        },
        {
          el: (element: HTMLElement): HTMLElement => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (element as any).autocomplete = undefined; // we are given an HTMLElement so this is a edge case safety check
            return element;
          },
          masked: false,
        },
        {
          el: (element: HTMLElement): HTMLElement => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            (element as any).type = null; // we are given an HTMLElement so this is a edge case safety check
            return element;
          },
          masked: false,
        },
      ])('check masked', ({ el, masked }) => {
        const inputElement = document.createElement('input');
        const result = maskFn('input', privacyConfig)('some text', el(inputElement));
        expect(result).toStrictEqual(masked ? '**** ****' : 'some text');
      });
    });
  });

  describe('maskFn -- text', () => {
    test('should mask on amp mask', () => {
      const htmlElement = document.createElement('text');
      htmlElement.classList.add(MASK_TEXT_CLASS);
      const result = maskFn('text')('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should mask on conservative level', () => {
      const htmlElement = document.createElement('text');
      const result = maskFn('text', { defaultMaskLevel: 'conservative' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    // this will never happen in reality since rrweb will not call this
    // function if we had not registered selectors
    test('should mask an element on light mask level', () => {
      const htmlElement = document.createElement('div');
      const result = maskFn('text', { defaultMaskLevel: 'light' })('some text', htmlElement);
      expect(result).toEqual('**** ****');
    });
    test('should not mask an element whose class list has amp-unmask in it', () => {
      const htmlElement = document.createElement('div');
      htmlElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskFn('text')('some text', htmlElement);
      expect(result).toEqual('some text');
    });
  });

  describe('generateHashCode', () => {
    test('should return 0 if string length is 0', () => {
      const hashCode = generateHashCode('');
      expect(hashCode).toEqual(0);
    });
    test('should return hash for numeric string', () => {
      const hashCode = generateHashCode('1691093770366');
      expect(hashCode).toEqual(139812688);
    });
    test('should return hash for alphabetic string', () => {
      const hashCode = generateHashCode('my_session_identifier');
      expect(hashCode).toEqual(989939557);
    });
  });

  describe('isSessionInSample', () => {
    test('should deterministically return true if calculation puts session id below sample rate', () => {
      const result = isSessionInSample(1691092433788, 0.56);
      expect(result).toEqual(true);
    });
    test('should deterministically return false if calculation puts session id above sample rate', () => {
      const result = isSessionInSample(1691092416403, 0.13);
      expect(result).toEqual(false);
    });
  });

  describe('getServerUrl', () => {
    test('should return us server url if no config set', () => {
      expect(getServerUrl()).toEqual(SESSION_REPLAY_SERVER_URL);
    });

    test('should return staging server url if staging config set', async () => {
      expect(getServerUrl(ServerZone.STAGING)).toEqual(SESSION_REPLAY_STAGING_URL);
    });

    test('should return eu server url if eu config set', async () => {
      expect(getServerUrl(ServerZone.EU)).toEqual(SESSION_REPLAY_EU_URL);
    });

    test('should allow server url override', async () => {
      const customUrl = 'http://localhost:3000';

      expect(getServerUrl(ServerZone.EU, customUrl)).toEqual(customUrl);
    });
  });

  describe('getStorageSize', () => {
    test('should return a default set of data if global scope is not defined', async () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);
      const storageSize = await getStorageSize();
      expect(storageSize).toEqual({ totalStorageSize: 0, percentOfQuota: 0, usageDetails: '' });
    });
    test('should return formatted storage size data', async () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: {
          storage: {
            estimate: async () => {
              return {
                usage: 214333,
                quota: 45673324,
                usageDetails: {
                  indexedDB: 10,
                },
              };
            },
          } as unknown as StorageManager,
        } as unknown as Navigator,
      } as unknown as typeof globalThis);
      const storageSize = await getStorageSize();
      expect(storageSize).toEqual({ totalStorageSize: 209, percentOfQuota: 0.005, usageDetails: '{"indexedDB":10}' });
    });
    test('should return a default set of data if values within navigator are not defined', async () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: {
          storage: {
            estimate: async () => {
              return {
                usageDetails: {
                  indexedDB: 10,
                },
              };
            },
          } as unknown as StorageManager,
        } as unknown as Navigator,
      } as unknown as typeof globalThis);
      const storageSize = await getStorageSize();
      expect(storageSize).toEqual({ totalStorageSize: 0, percentOfQuota: 0, usageDetails: '{"indexedDB":10}' });
    });
  });

  describe('getPageUrl', () => {
    const mockLogger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      disable: jest.fn(),
      enable: jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return original URL when no filter rules are provided', () => {
      const url = 'https://example.com/page';
      const result = getPageUrl(mockLogger, url);
      expect(result).toBe(url);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should return original URL when filter rules have invalid format', () => {
      const url = 'https://example.com/page';
      const invalidRules = [
        { selector: 123, replacement: 'replacement' },
        { selector: 'pattern', replacement: 456 },
      ] as unknown as UGCFilterRule[];
      const result = getPageUrl(mockLogger, url, invalidRules);
      expect(result).toBe(url);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'ugcFilterRules must be an array of objects with selector and replacement properties',
      );
    });

    test('should return original URL when filter rules contain invalid glob patterns', () => {
      const url = 'https://example.com/page';
      const invalidRules: UGCFilterRule[] = [{ selector: 'invalid[pattern', replacement: 'replacement' }];
      const result = getPageUrl(mockLogger, url, invalidRules);
      expect(result).toBe(url);
      expect(mockLogger.error).toHaveBeenCalledWith('ugcFilterRules must be an array of objects with valid globs');
    });

    test('should apply single filter rule correctly', () => {
      const url = 'https://example.com/user/123';
      const rules: UGCFilterRule[] = [
        { selector: 'https://example.com/user/*', replacement: 'https://example.com/user/user_id' },
      ];
      const result = getPageUrl(mockLogger, url, rules);
      expect(result).toBe('https://example.com/user/user_id');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should apply multiple first matching rule in order', () => {
      const url = 'https://example.com/user/123/profile';
      const rules: UGCFilterRule[] = [
        { selector: 'https://example.com/user/*/*', replacement: 'https://example.com/user/user_id/space_name' },
        {
          selector: 'https://example.com/user/*/profile',
          replacement: 'https://example.com/user/user_id/profile_page',
        },
      ];
      const result = getPageUrl(mockLogger, url, rules);
      expect(result).toBe('https://example.com/user/user_id/space_name');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should handle complex glob patterns', () => {
      const url = 'https://example.com/products/electronics/123';
      const rules: UGCFilterRule[] = [
        {
          selector: 'https://example.com/products/*/*',
          replacement: 'https://example.com/products/category_id/item_id',
        },
      ];
      const result = getPageUrl(mockLogger, url, rules);
      expect(result).toBe('https://example.com/products/category_id/item_id');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should handle wildcard in glob patterns', () => {
      const url = 'https://example.com/project/123';
      const rules: UGCFilterRule[] = [
        { selector: 'https://*.com/*/*', replacement: 'https://company_name.com/category_id/item_id' },
      ];
      const result = getPageUrl(mockLogger, url, rules);
      expect(result).toBe('https://company_name.com/category_id/item_id');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('should handle question mark in glob patterns', () => {
      const url = 'https://example.com/p?ge';
      const rules: UGCFilterRule[] = [
        { selector: 'https://example.com/p?ge', replacement: 'https://example.com/page' },
      ];
      const result = getPageUrl(mockLogger, url, rules);
      expect(result).toBe('https://example.com/page');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });
});
