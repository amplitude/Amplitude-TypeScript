import { translateRemoteConfigToLocal, updateBrowserConfigWithRemoteConfig } from '../../src/config/joined-config';
import { createConfigurationMock } from '../helpers/mock';
import {
  AutocaptureOptions,
  NetworkTrackingOptions,
  SAFE_HEADERS,
  type BrowserConfig,
  type ElementInteractionsOptions,
} from '@amplitude/analytics-core';

function expectIsAutocaptureObjectWithElementInteractions(config: BrowserConfig): asserts config is BrowserConfig & {
  autocapture: BrowserConfig['autocapture'] & { elementInteractions: ElementInteractionsOptions };
} {
  expect(config).toHaveProperty('autocapture');
  expect(config.autocapture).toHaveProperty('elementInteractions');
}

describe('joined-config', () => {
  let localConfig: BrowserConfig;

  beforeEach(() => {
    localConfig = { ...createConfigurationMock(), defaultTracking: false, autocapture: false };
  });

  describe('updateBrowserConfigWithRemoteConfig', () => {
    test('should not modify local config if remote config is null', () => {
      const originalConfig = { ...localConfig };
      updateBrowserConfigWithRemoteConfig(null, localConfig);
      expect(localConfig).toEqual(originalConfig);
    });

    test('should disable elementInteractions if remote config sets it to false', () => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: true,
        }),
      );

      const remoteConfig = {
        autocapture: {
          elementInteractions: false,
        },
      };

      const expectedAutocapture = {
        sessions: true,
        fileDownloads: true,
        formInteractions: true,
        pageViews: true,
        attribution: true,
        elementInteractions: false,
        frustrationInteractions: true,
        webVitals: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(expectedAutocapture);
      expect(localConfig.defaultTracking).toStrictEqual(expectedAutocapture);
    });

    test('should disable defaultTracking if remote config sets it to false', () => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: true,
          defaultTracking: true,
        }),
      );

      const remoteConfig = {
        autocapture: {
          fileDownloads: false,
          formInteractions: false,
          pageViews: false,
          attribution: false,
          sessions: false,
        },
      };

      const expectedAutocapture = {
        fileDownloads: false,
        formInteractions: false,
        pageViews: false,
        attribution: false,
        sessions: false,
        elementInteractions: true,
        frustrationInteractions: true,
        webVitals: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.defaultTracking).toStrictEqual(expectedAutocapture);
      expect(localConfig.autocapture).toStrictEqual(expectedAutocapture);
    });

    test.each([
      {
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        attribution: false,
        pageViews: false,
        frustrationInteractions: false,
        webVitals: false,
      },
      false,
    ])('should only enable elementInteractions if remote config only sets it to true', (localAutocapture) => {
      localConfig = createConfigurationMock(
        createConfigurationMock({
          autocapture: localAutocapture,
        }),
      );

      const remoteConfig = {
        autocapture: {
          elementInteractions: true,
        },
      };

      const expectedJoinedConfig = {
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        attribution: false,
        pageViews: false,
        elementInteractions: true,
        frustrationInteractions: false,
        webVitals: false,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(expectedJoinedConfig);
      expect(localConfig.defaultTracking).toStrictEqual(expectedJoinedConfig);
    });

    test('should use remote autocapture if local autocapture is undefined', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: false,
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toStrictEqual(remoteConfig.autocapture);
      expect(localConfig.defaultTracking).toStrictEqual(remoteConfig.autocapture);
    });

    test.each([true, false])(
      'should overwrite local autocapture if remote autocapture is boolean',
      (remoteAutocapture) => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: remoteAutocapture,
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.autocapture).toStrictEqual(remoteAutocapture);
        expect(localConfig.defaultTracking).toStrictEqual(remoteAutocapture);
      },
    );

    test('should handle errors gracefully', () => {
      const logError = jest.spyOn(localConfig.loggerProvider, 'error');

      // Create a problematic remote config that will cause an error when accessed.
      // This test is necessary because RemoteConfig uses `any` type for value, allowing external
      // sources to provide malformed data with getters, functions, or other constructs
      // that could throw errors.
      const remoteConfig = {
        autocapture: {
          get elementInteractions() {
            throw new Error('Test error');
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(logError).toHaveBeenCalledWith(
        'Failed to apply remote configuration because of error: ',
        expect.any(Error),
      );
    });

    test('should merge local and remote config', () => {
      const remoteConfig = {
        autocapture: true,
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
      expect(localConfig.autocapture).toBe(true);
      expect(localConfig.defaultTracking).toBe(true);
    });

    test('should convert pageUrlAllowlistRegex strings to RegExp objects and combine with pageUrlAllowlist', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlist: ['exact-match.com', 'another-exact-match.com'],
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the combined pageUrlAllowlist contains both exact matches and RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(4);

      // First two items should be strings
      expect(pageUrlAllowlist?.[0]).toBe('exact-match.com');
      expect(pageUrlAllowlist?.[1]).toBe('another-exact-match.com');

      // Last two items should be RegExp objects
      expect(pageUrlAllowlist?.[2]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[3]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[2].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[3].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });

    test('should handle empty pageUrlAllowlist when pageUrlAllowlistRegex is provided', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the pageUrlAllowlist contains only RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(2);

      // Both items should be RegExp objects
      expect(pageUrlAllowlist?.[0]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[1]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[0].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[1].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });

    test('should skip and warn on invalid regex patterns', () => {
      localConfig = createConfigurationMock(createConfigurationMock({}));

      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlistRegex: ['^https://.*\\.example\\.com$', '***', '.*\\.amplitude\\.com$'],
          },
        },
      };

      const logWarn = jest.spyOn(localConfig.loggerProvider, 'warn');

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Verify the pageUrlAllowlist contains only RegExp objects
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      expect(pageUrlAllowlist?.length).toBe(2);

      // Both items should be RegExp objects
      expect(pageUrlAllowlist?.[0]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[1]).toBeInstanceOf(RegExp);
      expect(pageUrlAllowlist?.[0].toString()).toBe(new RegExp('^https://.*\\.example\\.com$').toString());
      expect(pageUrlAllowlist?.[1].toString()).toBe(new RegExp('.*\\.amplitude\\.com$').toString());

      // pageUrlAllowlistRegex should have been removed
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');

      expect(logWarn).toHaveBeenCalledWith('Invalid regex pattern: ***', expect.any(Error));
    });

    test('should not fail or override pageUrlAllowlist when pageUrlAllowlistRegex is undefined', () => {
      localConfig = createConfigurationMock({});

      // Define the remote configuration with an existing exact match allowlist and pageUrlAllowlistRegex as undefined
      const remoteConfig = {
        autocapture: {
          elementInteractions: {
            pageUrlAllowlist: ['existing-domain.com', 'another-domain.net'],
          },
        },
      };

      updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

      // Assert: Verify that the original pageUrlAllowlist remains unchanged
      // Ensure the autocapture and elementInteractions objects exist in the joined config
      expectIsAutocaptureObjectWithElementInteractions(localConfig);
      const elementInteractions = localConfig.autocapture?.elementInteractions;
      expect(elementInteractions).toBeDefined();

      const pageUrlAllowlist = elementInteractions.pageUrlAllowlist;
      expect(Array.isArray(pageUrlAllowlist)).toBe(true);
      // Expect the list to have the original exact match strings
      expect(pageUrlAllowlist?.length).toBe(2);

      // Verify that the elements in the allowlist are the original strings
      expect(pageUrlAllowlist?.[0]).toBe('existing-domain.com');
      expect(pageUrlAllowlist?.[1]).toBe('another-domain.net');

      // Assert: Verify that the pageUrlAllowlistRegex property has been removed (even if it was undefined)
      expect(elementInteractions).not.toHaveProperty('pageUrlAllowlistRegex');
    });

    describe('networkTracking', () => {
      describe('headers', () => {
        test('should translate responseHeaders and requestHeaders to local responseHeaders and requestHeaders', () => {
          localConfig = createConfigurationMock(createConfigurationMock({}));

          const remoteConfig = {
            autocapture: {
              networkTracking: {
                captureRules: [
                  {
                    responseHeaders: {
                      captureSafeHeaders: true,
                      allowlist: ['content-type', 'x-fake-response-header'],
                    },
                    requestHeaders: {
                      captureSafeHeaders: true,
                      allowlist: ['content-type', 'x-fake-request-header'],
                    },
                  },
                ],
              },
            },
          };

          updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toEqual([
            ...SAFE_HEADERS,
            'content-type',
            'x-fake-response-header',
          ]);
          expect(networkTracking?.captureRules?.[0].requestHeaders).toEqual([
            ...SAFE_HEADERS,
            'content-type',
            'x-fake-request-header',
          ]);
        });

        test('should translate captureSafeHeaders to local captureSafeHeaders', () => {
          localConfig = createConfigurationMock(createConfigurationMock({}));

          const remoteConfig = {
            autocapture: {
              networkTracking: {
                captureRules: [
                  { responseHeaders: { captureSafeHeaders: true }, requestHeaders: { captureSafeHeaders: true } },
                ],
              },
            },
          };

          updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toEqual([...SAFE_HEADERS]);
          expect(networkTracking?.captureRules?.[0].requestHeaders).toEqual([...SAFE_HEADERS]);
        });

        test('should translate allowlist to local allowlist', () => {
          localConfig = createConfigurationMock(createConfigurationMock({}));

          const remoteConfig = {
            autocapture: {
              networkTracking: {
                captureRules: [
                  {
                    responseHeaders: { allowlist: ['content-type', 'x-fake-response-header'] },
                    requestHeaders: { allowlist: ['content-type', 'x-fake-request-header'] },
                  },
                ],
              },
            },
          };

          updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toEqual([
            'content-type',
            'x-fake-response-header',
          ]);
          expect(networkTracking?.captureRules?.[0].requestHeaders).toEqual(['content-type', 'x-fake-request-header']);
        });

        test('if undefined, should not translate', () => {
          localConfig = createConfigurationMock(createConfigurationMock({}));

          const remoteConfig = {
            autocapture: {
              networkTracking: { captureRules: [{ responseHeaders: undefined, requestHeaders: undefined }] },
            },
          };

          updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toBeUndefined();
          expect(networkTracking?.captureRules?.[0].requestHeaders).toBeUndefined();
        });

        test('should not fail if headers are malformed', () => {
          localConfig = createConfigurationMock(createConfigurationMock({}));

          const remoteConfig = {
            autocapture: { networkTracking: { captureRules: [{ responseHeaders: { allowlist: { wrong: 'type' } } }] } },
          };

          updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

          const autocapture = localConfig.autocapture as AutocaptureOptions;
          const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
          expect(networkTracking?.captureRules?.[0].responseHeaders).toBeUndefined();
          expect(networkTracking?.captureRules?.[0].requestHeaders).toBeUndefined();
        });
      });

      test('should merge urls and urlsRegex', () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [
                {
                  urls: ['https://example.com/path', /path\/to/],
                  urlsRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'],
                },
              ],
            },
          },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual([
          'https://example.com/path',
          /path\/to/,
          /^https:\/\/.*\.example\.com$/,
          /.*\.amplitude\.com$/,
        ]);
      });

      test('should merge urls if urlsRegex is undefined', () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [{ urls: ['https://example.com/path', /path\/to/] }],
            },
          },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual(['https://example.com/path', /path\/to/]);
      });

      test('should merge urls if urls is undefined and urlsRegex is provided', () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: {
            networkTracking: {
              captureRules: [{ urlsRegex: ['^https://.*\\.example\\.com$', '.*\\.amplitude\\.com$'] }],
            },
          },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules?.[0].urls).toEqual([
          /^https:\/\/.*\.example\.com$/,
          /.*\.amplitude\.com$/,
        ]);
      });

      test('should not have urls if captureRules is undefined', () => {
        localConfig = createConfigurationMock(createConfigurationMock({}));

        const remoteConfig = {
          autocapture: {
            networkTracking: {},
          },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);

        const autocapture = localConfig.autocapture as AutocaptureOptions;
        const networkTracking = autocapture.networkTracking as NetworkTrackingOptions;
        expect(networkTracking?.captureRules).toBeUndefined();
      });
    });

    describe('customEnrichment', () => {
      test('should merge customEnrichment from remote config when enabled', () => {
        const remoteConfig = {
          customEnrichment: { enabled: true, body: 'return event;' },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.customEnrichment).toStrictEqual({ body: 'return event;' });
      });

      test('should set customEnrichment to false when remote config disables it', () => {
        localConfig.customEnrichment = { enabled: true, body: 'return event;' };

        const remoteConfig = {
          customEnrichment: { enabled: false, body: 'return event;' },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.customEnrichment).toBe(false);
      });

      test('should not modify customEnrichment if remote config does not include it', () => {
        localConfig.customEnrichment = { enabled: true, body: 'return event;' };

        const remoteConfig = {
          autocapture: true,
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.customEnrichment).toStrictEqual({ enabled: true, body: 'return event;' });
      });

      test('should set customEnrichment to true when remote config has enabled-only', () => {
        const remoteConfig = {
          customEnrichment: { enabled: true },
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig, localConfig);
        expect(localConfig.customEnrichment).toBe(true);
      });

      test('should not modify customEnrichment when remote config delivers null', () => {
        localConfig.customEnrichment = { enabled: true, body: 'return event;' };

        const remoteConfig = {
          customEnrichment: null,
        };

        updateBrowserConfigWithRemoteConfig(remoteConfig as any, localConfig);
        expect(localConfig.customEnrichment).toStrictEqual({ enabled: true, body: 'return event;' });
      });
    });
  });

  describe('translateRemoteConfigToLocal', () => {
    describe('should translate property to true when', () => {
      test('enabled is true and object has no other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(true);
      });
    });
    describe('should translate property to false when', () => {
      test('enabled is false and object has no other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: false,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(false);
      });
      test('enabled is false and object has other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: false,
                deadClicks: true,
                rageClicks: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toBe(false);
      });
    });
    describe('should translate property to object when', () => {
      test('enabled is true and object has other properties', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: {
                enabled: true,
                deadClicks: true,
                rageClicks: true,
              },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toEqual({
          deadClicks: true,
          rageClicks: true,
        });
      });
    });
    describe('should not translate property when', () => {
      test('property is an array', () => {
        const config = ['a', 'b', 'c'];
        translateRemoteConfigToLocal(config);
        expect(config).toEqual(['a', 'b', 'c']);
      });
      test('config is null', () => {
        const config = null;
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-argument */
        translateRemoteConfigToLocal(config as any);
        expect(config).toBeNull();
      });
      test('enabled is not present', () => {
        const config = { prop: { subprop: { hello: true, foobar: null } } };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ prop: { subprop: { hello: true, foobar: null } } });
      });
      test('property is null', () => {
        const config = { hello: null };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ hello: null });
      });
      test('property is a boolean', () => {
        const config = { hello: true };
        translateRemoteConfigToLocal(config);
        expect(config).toEqual({ hello: true });
      });
    });
    describe('frustrationInteractions', () => {
      test('should translate rageClick to rageClicks', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: { rageClick: true },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toEqual({ rageClicks: true });
      });

      test('should translate deadClick to deadClicks', () => {
        const remoteConfig = {
          browserSDK: {
            autocapture: {
              frustrationInteractions: { deadClick: true },
            },
          },
        };
        translateRemoteConfigToLocal(remoteConfig);
        expect(remoteConfig.browserSDK.autocapture.frustrationInteractions).toEqual({ deadClicks: true });
      });
    });

    describe('viewportContentUpdated', () => {
      describe('enabled normalization', () => {
        test('should convert viewportContentUpdated: true to an empty object', () => {
          // { enabled: true } with no other props collapses to the boolean `true` by the generic
          // pass; this block converts it back to {} so the SDK gets a VCU options object.
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: true,
              },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({});
        });

        test('should preserve viewportContentUpdated when it is already an object with properties', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { exposureDuration: 200 },
              },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 200 });
        });

        test('should set viewportContentUpdated to false when enabled is false', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { enabled: false, exposureDuration: 200 },
              },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toBe(false);
        });

        test('should not modify elementInteractions when viewportContentUpdated is absent', () => {
          const config = {
            autocapture: {
              elementInteractions: { cssSelectorAllowlist: ['a'] },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions).toEqual({ cssSelectorAllowlist: ['a'] });
        });

        test('should not throw when elementInteractions is false', () => {
          const config = {
            autocapture: {
              elementInteractions: false,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions).toBe(false);
        });

        test('should not throw when autocapture has no elementInteractions', () => {
          const config = { autocapture: {} };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture).toEqual({});
        });

        test('should handle errors from elementInteractions accessor gracefully', () => {
          const config = {
            autocapture: {
              get elementInteractions() {
                throw new Error('accessor error');
              },
            },
          };
          expect(() => translateRemoteConfigToLocal(config)).not.toThrow();
        });
      });

      describe('exposureDuration migration', () => {
        test('should migrate deprecated top-level exposureDuration to viewportContentUpdated when vcu is absent', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 300 });
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });

        test('should migrate deprecated top-level exposureDuration to viewportContentUpdated when vcu is true', () => {
          // After the enabled-normalization pass, viewportContentUpdated may still be `true`
          // (e.g. { enabled: true } → true) before this migration runs.
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: true,
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 300 });
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });

        test('should migrate deprecated exposureDuration when viewportContentUpdated object has no exposureDuration', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { exposureDuration: undefined },
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 300 });
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });

        test('should not overwrite existing viewportContentUpdated.exposureDuration with deprecated value', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { exposureDuration: 500 },
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 500 });
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });

        test('should remove deprecated exposureDuration even when viewportContentUpdated is false', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: false,
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toBe(false);
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });

        test('should not touch elementInteractions when exposureDuration is absent', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { exposureDuration: 200 },
              },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ exposureDuration: 200 });
          expect(config.autocapture.elementInteractions).not.toHaveProperty('exposureDuration');
        });
      });
    });
  });
});
