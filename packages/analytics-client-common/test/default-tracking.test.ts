import {
  getAttributionTrackingConfig,
  getPageViewTrackingConfig,
  isAttributionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isPageViewTrackingEnabled,
  isSessionTrackingEnabled,
} from '../src/default-tracking';

describe('isFileDownloadTrackingEnabled', () => {
  test('should return true with boolean parameter', () => {
    expect(isFileDownloadTrackingEnabled(true)).toBe(true);
  });

  test('should return true with object parameter', () => {
    expect(
      isFileDownloadTrackingEnabled({
        fileDownloads: true,
      }),
    ).toBe(true);
  });

  test('should return false', () => {
    expect(isFileDownloadTrackingEnabled(undefined)).toBe(false);
  });
});

describe('isFormInteractionTrackingEnabled', () => {
  test('should return true with boolean parameter', () => {
    expect(isFormInteractionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with object parameter', () => {
    expect(
      isFormInteractionTrackingEnabled({
        formInteractions: true,
      }),
    ).toBe(true);
  });

  test('should return false', () => {
    expect(isFormInteractionTrackingEnabled(undefined)).toBe(false);
  });
});

describe('isPageViewTrackingEnabled', () => {
  test('should return true with boolean parameter', () => {
    expect(isPageViewTrackingEnabled(true)).toBe(true);
  });

  test('should return true with object parameter', () => {
    expect(
      isPageViewTrackingEnabled({
        pageViews: true,
      }),
    ).toBe(true);
  });

  test('should return true with nested object parameter', () => {
    expect(
      isPageViewTrackingEnabled({
        pageViews: {
          trackOn: 'attribution',
        },
      }),
    ).toBe(true);
  });

  test('should return false', () => {
    expect(isPageViewTrackingEnabled(undefined)).toBe(false);
  });
});

describe('isSessionTrackingEnabled', () => {
  test('should return true with boolean parameter', () => {
    expect(isSessionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with object parameter', () => {
    expect(
      isSessionTrackingEnabled({
        sessions: true,
      }),
    ).toBe(true);
  });

  test('should return false', () => {
    expect(isSessionTrackingEnabled(undefined)).toBe(false);
  });
});

describe('isAttributionTrackingEnabled', () => {
  test('should return true with boolean parameter', () => {
    expect(isAttributionTrackingEnabled(true)).toBe(true);
  });

  test('should return true with object parameter', () => {
    expect(
      isAttributionTrackingEnabled({
        attribution: true,
      }),
    ).toBe(true);
  });

  test('should return false', () => {
    expect(isAttributionTrackingEnabled(undefined)).toBe(false);
  });
});

describe('getPageViewTrackingConfig', () => {
  test('should return always track config', () => {
    const config = getPageViewTrackingConfig({
      defaultTracking: {
        pageViews: true,
      },
    });

    expect(config.trackOn).toBe(undefined);
  });

  test('should return never track config with default tracking', () => {
    const config = getPageViewTrackingConfig({});

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
