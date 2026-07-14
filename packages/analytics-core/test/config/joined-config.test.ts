import { translateRemoteConfigToLocal, SAFE_HEADERS } from '../../src/index';

describe('joined-config', () => {
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

    describe('networkTracking headers', () => {
      test('should translate responseHeaders and requestHeaders to local responseHeaders and requestHeaders', () => {
        const remoteConfig: any = {
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

        translateRemoteConfigToLocal(remoteConfig);

        expect(remoteConfig.autocapture.networkTracking.captureRules[0].responseHeaders).toEqual([
          ...SAFE_HEADERS,
          'content-type',
          'x-fake-response-header',
        ]);
        expect(remoteConfig.autocapture.networkTracking.captureRules[0].requestHeaders).toEqual([
          ...SAFE_HEADERS,
          'content-type',
          'x-fake-request-header',
        ]);
      });

      test('should translate captureSafeHeaders to local captureSafeHeaders', () => {
        const remoteConfig: any = {
          autocapture: {
            networkTracking: {
              captureRules: [
                { responseHeaders: { captureSafeHeaders: true }, requestHeaders: { captureSafeHeaders: true } },
              ],
            },
          },
        };

        translateRemoteConfigToLocal(remoteConfig);

        expect(remoteConfig.autocapture.networkTracking.captureRules[0].responseHeaders).toEqual([...SAFE_HEADERS]);
        expect(remoteConfig.autocapture.networkTracking.captureRules[0].requestHeaders).toEqual([...SAFE_HEADERS]);
      });

      test('should translate allowlist to local allowlist', () => {
        const remoteConfig: any = {
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

        translateRemoteConfigToLocal(remoteConfig);

        expect(remoteConfig.autocapture.networkTracking.captureRules[0].responseHeaders).toEqual([
          'content-type',
          'x-fake-response-header',
        ]);
        expect(remoteConfig.autocapture.networkTracking.captureRules[0].requestHeaders).toEqual([
          'content-type',
          'x-fake-request-header',
        ]);
      });

      test('if undefined, should not translate', () => {
        const remoteConfig: any = {
          autocapture: {
            networkTracking: { captureRules: [{ responseHeaders: undefined, requestHeaders: undefined }] },
          },
        };

        translateRemoteConfigToLocal(remoteConfig);

        expect(remoteConfig.autocapture.networkTracking.captureRules[0].responseHeaders).toBeUndefined();
        expect(remoteConfig.autocapture.networkTracking.captureRules[0].requestHeaders).toBeUndefined();
      });

      test('should not fail if headers are malformed', () => {
        const remoteConfig: any = {
          autocapture: { networkTracking: { captureRules: [{ responseHeaders: { allowlist: { wrong: 'type' } } }] } },
        };

        translateRemoteConfigToLocal(remoteConfig);

        expect(remoteConfig.autocapture.networkTracking.captureRules[0].responseHeaders).toBeUndefined();
        expect(remoteConfig.autocapture.networkTracking.captureRules[0].requestHeaders).toBeUndefined();
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

        test('should convert viewportContentUpdated to { enabled: false } when enabled is false', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: { enabled: false, exposureDuration: 200 },
              },
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ enabled: false });
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

        test('should remove deprecated exposureDuration and convert false viewportContentUpdated to { enabled: false }', () => {
          const config = {
            autocapture: {
              elementInteractions: {
                viewportContentUpdated: false,
                exposureDuration: 300,
              } as any,
            },
          };
          translateRemoteConfigToLocal(config);
          expect(config.autocapture.elementInteractions.viewportContentUpdated).toEqual({ enabled: false });
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
