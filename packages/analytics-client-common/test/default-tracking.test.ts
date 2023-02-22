import {
  getPageViewTrackingConfig,
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

describe('getPageViewTrackingConfig', () => {
  test('should return track on attribution config', () => {
    const config = getPageViewTrackingConfig({
      attribution: {
        trackPageViews: true,
      },
    });

    expect(config.trackOn).toBe('attribution');
  });

  test('should return never track config', () => {
    const config = getPageViewTrackingConfig({});

    expect(typeof config.trackOn).toBe('function');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore asserts that track on is a function that returns a boolean
    expect(config.trackOn()).toBe(false);
  });

  test('should return always track config', () => {
    const config = getPageViewTrackingConfig({
      defaultTracking: {
        pageViews: true,
      },
    });

    expect(typeof config.trackOn).toBe('function');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore asserts that track on is a function that returns a boolean
    expect(config.trackOn()).toBe(true);
  });

  test('should return never track config with default tracking', () => {
    const config = getPageViewTrackingConfig({});

    expect(typeof config.trackOn).toBe('function');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore asserts that track on is a function that returns a boolean
    expect(config.trackOn()).toBe(false);
  });
});
