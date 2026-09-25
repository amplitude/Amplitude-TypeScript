/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { UGCFilterRule } from '../src/config/types';
import { SESSION_REPLAY_EU_URL, SESSION_REPLAY_SERVER_URL, SESSION_REPLAY_STAGING_URL } from '../src/constants';
import { ServerZone } from '@amplitude/analytics-core';
import { getServerUrl, getStorageSize, getPageUrl, validateUGCFilterRules } from '../src/helpers';
import * as AnalyticsCore from '@amplitude/analytics-core';

describe('SessionReplayPlugin helpers', () => {
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
