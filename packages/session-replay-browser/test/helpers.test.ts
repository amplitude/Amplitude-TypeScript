/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrivacyConfig, UGCFilterRule } from '../src/config/types';
import {
  MASK_TEXT_CLASS,
  SESSION_REPLAY_EU_URL,
  SESSION_REPLAY_SERVER_URL,
  SESSION_REPLAY_STAGING_URL,
  UNMASK_TEXT_CLASS,
} from '../src/constants';
import { ServerZone } from '@amplitude/analytics-core';
import {
  getEffectiveMaskLevel,
  getServerUrl,
  getStorageSize,
  isMasked,
  maskFn,
  maskAttributeFn,
  getPageUrl,
  validateUGCFilterRules,
} from '../src/helpers';
import * as AnalyticsCore from '@amplitude/analytics-core';

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

  describe('maskAttributeFn', () => {
    const element = document.createElement('input');

    test('returns value unchanged for style attribute', () => {
      const result = maskAttributeFn({ maskAttributes: ['style'] })('style', 'color: red', element);
      expect(result).toEqual('color: red');
    });

    test('masks attribute listed in maskAttributes', () => {
      const result = maskAttributeFn({ maskAttributes: ['placeholder'] })('placeholder', 'Enter name', element);
      expect(result).toEqual('***** ****');
    });

    test('preserves whitespace when masking', () => {
      const result = maskAttributeFn({ maskAttributes: ['aria-label'] })('aria-label', 'first last', element);
      expect(result).toEqual('***** ****');
    });

    test('returns value unchanged when key is not in maskAttributes', () => {
      const result = maskAttributeFn({ maskAttributes: ['placeholder'] })('aria-label', 'some label', element);
      expect(result).toEqual('some label');
    });

    test('returns value unchanged when maskAttributes is empty', () => {
      const result = maskAttributeFn({ maskAttributes: [] })('placeholder', 'Enter name', element);
      expect(result).toEqual('Enter name');
    });

    test('returns value unchanged when config is undefined', () => {
      const result = maskAttributeFn(undefined)('placeholder', 'Enter name', element);
      expect(result).toEqual('Enter name');
    });

    test('returns value unchanged when maskAttributes is undefined', () => {
      const result = maskAttributeFn({})('placeholder', 'Enter name', element);
      expect(result).toEqual('Enter name');
    });

    test('returns value unchanged when element has unmask class even if attribute is listed', () => {
      const unmaskedElement = document.createElement('input');
      unmaskedElement.classList.add(UNMASK_TEXT_CLASS);
      const result = maskAttributeFn({ maskAttributes: ['placeholder'] })('placeholder', 'Enter name', unmaskedElement);
      expect(result).toEqual('Enter name');
    });

    test('masks attribute when element matches maskSelector', () => {
      const selectedElement = document.createElement('input');
      selectedElement.classList.add('mask-this');
      const result = maskAttributeFn({
        defaultMaskLevel: 'light',
        maskSelector: ['.mask-this'],
        maskAttributes: ['placeholder'],
      })('placeholder', 'Enter name', selectedElement);
      expect(result).toEqual('***** ****');
    });

    test('re-evaluates masking after element class mutation', () => {
      const dynamicElement = document.createElement('input');
      dynamicElement.classList.add(UNMASK_TEXT_CLASS);
      const fn = maskAttributeFn({ maskAttributes: ['placeholder'] });

      // Initially unmasked because amp-unmask is present.
      expect(fn('placeholder', 'Enter name', dynamicElement)).toEqual('Enter name');

      // After removing amp-unmask, the same element should now be masked.
      dynamicElement.classList.remove(UNMASK_TEXT_CLASS);
      expect(fn('placeholder', 'Enter name', dynamicElement)).toEqual('***** ****');
    });

    test('re-evaluates masking after ancestor selector mutation', () => {
      const wrapper = document.createElement('div');
      wrapper.classList.add('unmask-parent');
      const dynamicElement = document.createElement('input');
      wrapper.appendChild(dynamicElement);

      const fn = maskAttributeFn({
        maskAttributes: ['placeholder'],
        unmaskSelector: ['.unmask-parent'],
      });

      // Initially unmasked because ancestor matches unmaskSelector.
      expect(fn('placeholder', 'Enter name', dynamicElement)).toEqual('Enter name');

      // After ancestor no longer matches, element should be masked.
      wrapper.classList.remove('unmask-parent');
      expect(fn('placeholder', 'Enter name', dynamicElement)).toEqual('***** ****');
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
    test('should return original URL when no filter rules are provided', () => {
      const url = 'https://example.com/page';
      const result = getPageUrl(url, []);
      expect(result).toBe(url);
    });

    test('should apply single filter rule correctly', () => {
      const url = 'https://example.com/user/123';
      const rules: UGCFilterRule[] = [
        { selector: 'https://example.com/user/*', replacement: 'https://example.com/user/user_id' },
      ];
      const result = getPageUrl(url, rules);
      expect(result).toBe('https://example.com/user/user_id');
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
      const result = getPageUrl(url, rules);
      expect(result).toBe('https://example.com/user/user_id/space_name');
    });

    test('should handle complex glob patterns', () => {
      const url = 'https://example.com/products/electronics/123';
      const rules: UGCFilterRule[] = [
        {
          selector: 'https://example.com/products/*/*',
          replacement: 'https://example.com/products/category_id/item_id',
        },
      ];
      const result = getPageUrl(url, rules);
      expect(result).toBe('https://example.com/products/category_id/item_id');
    });

    test('should handle wildcard in glob patterns', () => {
      const url = 'https://example.com/project/123';
      const rules: UGCFilterRule[] = [
        { selector: 'https://*.com/*/*', replacement: 'https://company_name.com/category_id/item_id' },
      ];
      const result = getPageUrl(url, rules);
      expect(result).toBe('https://company_name.com/category_id/item_id');
    });

    test('should handle question mark in glob patterns', () => {
      const url = 'https://example.com/p?ge';
      const rules: UGCFilterRule[] = [
        { selector: 'https://example.com/p?ge', replacement: 'https://example.com/page' },
      ];
      const result = getPageUrl(url, rules);
      expect(result).toBe('https://example.com/page');
    });
  });

  describe('getEffectiveMaskLevel', () => {
    test('should return defaultMaskLevel when no urlMaskLevels are configured', () => {
      const config: PrivacyConfig = { defaultMaskLevel: 'light' };
      expect(getEffectiveMaskLevel('https://example.com/page', config)).toBe('light');
    });

    test('should fall back to medium when no defaultMaskLevel and no urlMaskLevels match', () => {
      const config: PrivacyConfig = {};
      expect(getEffectiveMaskLevel('https://example.com/page', config)).toBe('medium');
    });

    test('should return matching urlMaskLevel for exact URL', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [{ match: 'https://example.com/settings', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel('https://example.com/settings', config)).toBe('conservative');
    });

    test('should return matching urlMaskLevel for glob pattern', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel('https://example.com/admin/users', config)).toBe('conservative');
    });

    test('should return first matching rule (first-match wins)', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: 'https://example.com/admin/*', maskLevel: 'conservative' },
          { match: 'https://example.com/admin/*', maskLevel: 'light' },
        ],
      };
      expect(getEffectiveMaskLevel('https://example.com/admin/users', config)).toBe('conservative');
    });

    test('should fall back to defaultMaskLevel when no urlMaskLevels match', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel('https://example.com/public/page', config)).toBe('light');
    });

    test('should fall back to defaultMaskLevel when url is undefined', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/*', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel(undefined, config)).toBe('light');
    });

    test('should fall back to defaultMaskLevel when url is empty', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/*', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel('', config)).toBe('light');
    });

    test('should handle wildcard subdomain matching', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [{ match: 'https://*.example.com/checkout/*', maskLevel: 'conservative' }],
      };
      expect(getEffectiveMaskLevel('https://shop.example.com/checkout/payment', config)).toBe('conservative');
    });

    test('should fall back to defaultMaskLevel when urlMaskLevels is an empty array', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [],
      };
      expect(getEffectiveMaskLevel('https://example.com/page', config)).toBe('light');
    });

    test('first-match-wins: first rule matching different patterns selects the first', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'medium',
        urlMaskLevels: [
          { match: 'https://example.com/checkout/*', maskLevel: 'conservative' },
          { match: 'https://example.com/*', maskLevel: 'light' },
        ],
      };
      // /checkout/payment matches the first rule
      expect(getEffectiveMaskLevel('https://example.com/checkout/payment', config)).toBe('conservative');
      // /public only matches the second rule
      expect(getEffectiveMaskLevel('https://example.com/public', config)).toBe('light');
    });
  });

  describe('isMasked with currentUrl', () => {
    test('should use urlMaskLevels when currentUrl is provided', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      const element = document.createElement('div');
      // On /admin/*, effective level is conservative → text should be masked
      expect(isMasked('text', config, element, 'https://example.com/admin/dashboard')).toBe(true);
    });

    test('should use defaultMaskLevel when currentUrl does not match any rule', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      const element = document.createElement('div');
      // On /public, effective level is light → input without sensitive type should not be masked
      expect(isMasked('input', config, element, 'https://example.com/public')).toBe(false);
    });

    test('should still respect per-element mask overrides over urlMaskLevels', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/public/*', maskLevel: 'light' }],
        unmaskSelector: [],
      };
      const element = document.createElement('div');
      element.classList.add(MASK_TEXT_CLASS);
      // amp-mask class takes priority even though URL-level says light
      expect(isMasked('input', config, element, 'https://example.com/public/page')).toBe(true);
    });

    test('should still respect per-element unmask overrides over urlMaskLevels', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'conservative',
        urlMaskLevels: [{ match: 'https://example.com/*', maskLevel: 'conservative' }],
      };
      const element = document.createElement('div');
      element.classList.add(UNMASK_TEXT_CLASS);
      // amp-unmask class takes priority even though URL-level says conservative
      expect(isMasked('text', config, element, 'https://example.com/page')).toBe(false);
    });

    test('should fall back to default behavior when currentUrl is not provided', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/*', maskLevel: 'conservative' }],
      };
      const element = document.createElement('div');
      // No URL → falls back to defaultMaskLevel (light), text is still masked by light
      expect(isMasked('text', config, element)).toBe(true);
      // Input with light level → not masked for non-sensitive inputs
      expect(isMasked('input', config, element)).toBe(false);
    });
  });

  describe('maskFn with getCurrentUrl', () => {
    test('should use URL-aware masking when getCurrentUrl is provided', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      const element = document.createElement('div');
      const fn = maskFn('input', config, () => 'https://example.com/admin/dashboard');
      expect(fn('some text', element)).toEqual('**** ****');
    });

    test('should reflect URL changes dynamically via getter', () => {
      const config: PrivacyConfig = {
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: 'https://example.com/admin/*', maskLevel: 'conservative' }],
      };
      let currentUrl = 'https://example.com/public/page';
      const fn = maskFn('input', config, () => currentUrl);
      const element = document.createElement('div');

      // On /public, light level → non-sensitive input not masked
      expect(fn('some text', element)).toEqual('some text');

      // Simulate SPA navigation to /admin
      currentUrl = 'https://example.com/admin/dashboard';
      expect(fn('some text', element)).toEqual('**** ****');
    });
  });

  describe('validateUGCFilterRules', () => {
    test('should not throw for valid rules', () => {
      const rules = [
        { selector: 'https://example.com/user/*', replacement: 'https://example.com/user/user_id' },
        { selector: 'https://example.com/product/*', replacement: 'https://example.com/product/product_id' },
      ];
      expect(() => validateUGCFilterRules(rules)).not.toThrow();
    });

    test('should throw for non-string selector', () => {
      const rules = [{ selector: 123, replacement: 'replacement' }] as unknown as UGCFilterRule[];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with selector and replacement properties',
      );
    });

    test('should throw for non-string replacement', () => {
      const rules: any = [{ selector: 'pattern', replacement: 456 }];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with selector and replacement properties',
      );
    });

    test('should throw for invalid glob pattern', () => {
      const rules: any = [{ selector: 'invalid[pattern', replacement: 'replacement' }];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with valid globs',
      );
    });

    test('should throw for empty string selector', () => {
      const rules = [{ selector: '', replacement: 'replacement' }];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with valid globs',
      );
    });

    test('should throw for whitespace-only selector', () => {
      const rules = [{ selector: '   ', replacement: 'replacement' }];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with valid globs',
      );
    });

    test('should throw for tab and newline whitespace selector', () => {
      const rules = [{ selector: '\t\n\r ', replacement: 'replacement' }];
      expect(() => validateUGCFilterRules(rules)).toThrow(
        'ugcFilterRules must be an array of objects with valid globs',
      );
    });
  });
});
