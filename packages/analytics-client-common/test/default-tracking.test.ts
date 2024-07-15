import {
  getAttributionTrackingConfig,
  getPageViewTrackingConfig,
  getUserInteractionsConfig,
  isAttributionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isPageViewTrackingEnabled,
  isSessionTrackingEnabled,
  isUserInteractionsEnabled,
} from '../src/default-tracking';

describe('isFileDownloadTrackingEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isFileDownloadTrackingEnabled(true)).toBe(true);
  });

  test('should return true with undefined parameter', () => {
    expect(isFileDownloadTrackingEnabled(undefined)).toBe(true);
  });

  test('should return false with false parameter', () => {
    expect(isFileDownloadTrackingEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isFileDownloadTrackingEnabled({
        fileDownloads: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isFileDownloadTrackingEnabled({
        fileDownloads: false,
      }),
    ).toBe(false);
  });
});

describe('isFormInteractionTrackingEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isFormInteractionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with undefined parameter', () => {
    expect(isFormInteractionTrackingEnabled(undefined)).toBe(true);
  });

  test('should return false with false parameter', () => {
    expect(isFormInteractionTrackingEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isFormInteractionTrackingEnabled({
        formInteractions: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isFormInteractionTrackingEnabled({
        formInteractions: false,
      }),
    ).toBe(false);
  });
});

describe('isPageViewTrackingEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isPageViewTrackingEnabled(true)).toBe(true);
  });

  test('should return true with undefined parameter', () => {
    expect(isPageViewTrackingEnabled(undefined)).toBe(true);
  });

  test('should return true with false parameter', () => {
    expect(isPageViewTrackingEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isPageViewTrackingEnabled({
        pageViews: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isPageViewTrackingEnabled({
        pageViews: false,
      }),
    ).toBe(false);
  });

  test('should return true with nested object parameter', () => {
    expect(
      isPageViewTrackingEnabled({
        pageViews: {},
      }),
    ).toBe(true);
  });
});

describe('isSessionTrackingEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isSessionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with undefined parameter', () => {
    expect(isSessionTrackingEnabled(undefined)).toBe(true);
  });

  test('should return false with false parameter', () => {
    expect(isSessionTrackingEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isSessionTrackingEnabled({
        sessions: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isSessionTrackingEnabled({
        sessions: false,
      }),
    ).toBe(false);
  });
});

describe('isAttributionTrackingEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isAttributionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with undefined parameter', () => {
    expect(isAttributionTrackingEnabled(undefined)).toBe(true);
  });

  test('should return false with false parameter', () => {
    expect(isAttributionTrackingEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isAttributionTrackingEnabled({
        attribution: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isAttributionTrackingEnabled({
        attribution: false,
      }),
    ).toBe(false);
  });
});

describe('isUserInteractionsEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isUserInteractionsEnabled(true)).toBe(true);
  });

  test('should return false with undefined parameter', () => {
    expect(isUserInteractionsEnabled(undefined)).toBe(false);
  });

  test('should return false with false parameter', () => {
    expect(isUserInteractionsEnabled(false)).toBe(false);
  });

  test('should return true with object parameter', () => {
    expect(
      isUserInteractionsEnabled({
        userInteractions: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter', () => {
    expect(
      isUserInteractionsEnabled({
        userInteractions: false,
      }),
    ).toBe(false);
  });

  test('should return false with object parameter undefined', () => {
    expect(
      isUserInteractionsEnabled({
        userInteractions: undefined,
      }),
    ).toBe(false);
  });
});

describe('getPageViewTrackingConfig', () => {
  test('should return undefined trackOn config', () => {
    const config = getPageViewTrackingConfig({
      defaultTracking: {
        pageViews: true,
      },
    });

    expect(config.trackOn).toBe(undefined);
  });

  test('should return trackOn config returning false', () => {
    const config = getPageViewTrackingConfig({
      defaultTracking: {
        pageViews: false,
      },
    });

    expect(typeof config.trackOn).toBe('function');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore asserts that track on is a function that returns a boolean
    expect(config.trackOn()).toBe(false);
  });

  test('should return advanced options', () => {
    const config = getPageViewTrackingConfig({
      defaultTracking: {
        pageViews: {
          trackOn: 'attribution',
          trackHistoryChanges: 'all',
          eventType: 'Page View',
        },
      },
    });

    expect(typeof config.trackOn).toBe('string');
    expect(config.trackOn).toBe('attribution');
    expect(config.trackHistoryChanges).toBe('all');
    expect(config.eventType).toBe('Page View');
  });
});

describe('getAttributionTrackingConfig', () => {
  test('should return disabled config', () => {
    const config = getAttributionTrackingConfig({
      defaultTracking: {
        attribution: false,
      },
    });
    expect(config).toEqual({
      excludeReferrers: undefined,
      initialEmptyValue: undefined,
      resetSessionOnNewCampaign: undefined,
    });
  });

  test('should return default config', () => {
    const config = getAttributionTrackingConfig({
      defaultTracking: {
        attribution: {},
      },
    });
    expect(config).toEqual({
      excludeReferrers: undefined,
      initialEmptyValue: undefined,
      resetSessionOnNewCampaign: undefined,
    });
  });

  test('should return custom config', () => {
    const config = getAttributionTrackingConfig({
      defaultTracking: {
        attribution: {
          excludeReferrers: [],
          initialEmptyValue: 'EMPTY',
          resetSessionOnNewCampaign: true,
        },
      },
    });
    expect(config).toEqual({
      excludeReferrers: [],
      initialEmptyValue: 'EMPTY',
      resetSessionOnNewCampaign: true,
    });
  });
});

describe('getUserInteractionsConfig', () => {
  test('should return an empty object when autocapture is true', () => {
    const config = getUserInteractionsConfig({
      autocapture: true,
    });

    expect(config).toBeUndefined();
  });

  test('should return an empty object when userInteraction is true', () => {
    const config = getUserInteractionsConfig({
      autocapture: {
        userInteractions: true,
      },
    });

    expect(config).toBeUndefined();
  });

  test('should return advanced options', () => {
    const testCssSelectorAllowlist = ['button'];
    const testPageUrlAllowlist = ['example.com'];
    const mockedShouldTrackEventResolver = jest.fn(() => true);
    const testDataAttributePrefix = 'data-amp-track';
    const config = getUserInteractionsConfig({
      autocapture: {
        userInteractions: {
          cssSelectorAllowlist: testCssSelectorAllowlist,
          pageUrlAllowlist: testPageUrlAllowlist,
          shouldTrackEventResolver: mockedShouldTrackEventResolver,
          dataAttributePrefix: testDataAttributePrefix,
        },
      },
    });

    expect(config?.cssSelectorAllowlist).toBe(testCssSelectorAllowlist);
    expect(config?.pageUrlAllowlist).toBe(testPageUrlAllowlist);
    expect(config?.shouldTrackEventResolver).toBe(mockedShouldTrackEventResolver);
    expect(config?.dataAttributePrefix).toBe(testDataAttributePrefix);
  });
});
