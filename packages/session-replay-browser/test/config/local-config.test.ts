import { ILogger, Logger } from '@amplitude/analytics-core';
import { SessionReplayLocalConfig } from '../../src/config/local-config';

describe('SessionReplayLocalConfig', () => {
  describe('flushIntervalConfig', () => {
    let warnSpy: jest.SpyInstance;
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {
        /* swallow */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('defaults to the validated amp-on-amp config when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 1000, maxIntervalMs: 10_000 });
    });

    test('passes through custom min/max when both are valid', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 2000, maxIntervalMs: 30_000 },
      });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 2000, maxIntervalMs: 30_000 });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('clamps minIntervalMs below the 100ms floor and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 0 },
      });
      expect(config.flushIntervalConfig?.minIntervalMs).toBe(100);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('minIntervalMs'));
    });

    test('clamps non-finite minIntervalMs (NaN, Infinity) to the floor', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: NaN },
      });
      expect(config.flushIntervalConfig?.minIntervalMs).toBe(100);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('minIntervalMs'));
    });

    test('preserves Infinity for maxIntervalMs as "no upper bound"', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 5000, maxIntervalMs: Infinity },
      });
      expect(config.flushIntervalConfig?.maxIntervalMs).toBe(Infinity);
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('maxIntervalMs'));
    });

    test('clamps NaN maxIntervalMs to the floor', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { maxIntervalMs: NaN },
      });
      expect(config.flushIntervalConfig?.maxIntervalMs).toBe(100);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('maxIntervalMs'));
    });

    test('raises max to match min when caller inverts them', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 5000, maxIntervalMs: 1000 },
      });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 5000, maxIntervalMs: 5000 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('less than minIntervalMs'));
    });

    test('accepts only minIntervalMs without maxIntervalMs when below default max', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 3000 },
      });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 3000 });
    });

    test('accepts only maxIntervalMs without minIntervalMs when above default min', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { maxIntervalMs: 30_000 },
      });
      expect(config.flushIntervalConfig).toEqual({ maxIntervalMs: 30_000 });
    });

    test('raises max to match user min when only minIntervalMs is set above the default max', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: 30_000 },
      });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 30_000, maxIntervalMs: 30_000 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds the default maxIntervalMs'));
    });

    test('lowers min to match user max when only maxIntervalMs is set below the default min', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { maxIntervalMs: 200 },
      });
      expect(config.flushIntervalConfig).toEqual({ minIntervalMs: 200, maxIntervalMs: 200 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('below the default minIntervalMs'));
    });
  });

  describe('canvas', () => {
    let warnSpy: jest.SpyInstance;
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {
        /* swallow */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('is undefined when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.canvas).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through enabled, sampling, and dataURLOptions', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: {
          enabled: true,
          sampling: 'all',
          dataURLOptions: { type: 'image/webp', quality: 0.6 },
        },
      });
      expect(config.canvas).toEqual({
        enabled: true,
        sampling: 'all',
        dataURLOptions: { type: 'image/webp', quality: 0.6 },
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through dataURLOptions.type without quality', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, dataURLOptions: { type: 'image/png' } },
      });
      expect(config.canvas).toEqual({ enabled: true, dataURLOptions: { type: 'image/png' } });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through a frames-per-second sampling value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, sampling: 15 },
      });
      expect(config.canvas).toEqual({ enabled: true, sampling: 15 });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('clamps sampling outside 1–60 and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, sampling: 120 },
      });
      expect(config.canvas?.sampling).toBe(60);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('canvas.sampling'));
    });

    test('ignores a sampling value that is not "all" or a finite number', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, sampling: 'fast' as 'all' },
      });
      expect(config.canvas).toEqual({ enabled: true });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('canvas.sampling'));
    });

    test('clamps dataURLOptions.quality outside 0–1 and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, dataURLOptions: { quality: 4 } },
      });
      expect(config.canvas?.dataURLOptions).toEqual({ quality: 1 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('quality'));
    });

    test('warns when sampling is set while recording is off', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: false, sampling: 15 },
      });
      expect(config.canvas).toEqual({ enabled: false, sampling: 15 });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('canvas.enabled is true'));
    });

    test('clamps sampling below 1 fps', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, sampling: 0 },
      });
      expect(config.canvas?.sampling).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('canvas.sampling'));
    });

    test('clamps dataURLOptions.quality below 0', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: { enabled: true, dataURLOptions: { type: 'image/jpeg', quality: -0.2 } },
      });
      expect(config.canvas?.dataURLOptions).toEqual({ type: 'image/jpeg', quality: 0 });
    });

    test.each([null, 1])('ignores a non-object canvas config (%p)', (canvas) => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: canvas as unknown as { enabled: boolean },
      });
      expect(config.canvas).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not an object'));
    });

    test('ignores an array canvas config', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: [] as unknown as { enabled: boolean },
      });
      expect(config.canvas).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not an object'));
    });

    test.each([null, 'webp', []])('ignores non-object dataURLOptions (%p)', (dataURLOptions) => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: {
          enabled: true,
          dataURLOptions: dataURLOptions as unknown as { type: string },
        },
      });
      expect(config.canvas).toEqual({ enabled: true });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dataURLOptions is not an object'));
    });

    test('ignores invalid dataURLOptions and non-finite sampling', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: {
          enabled: true,
          sampling: Number.NaN,
          dataURLOptions: null as unknown as { type: string },
        },
      });
      expect(config.canvas).toEqual({ enabled: true });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('canvas.sampling'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dataURLOptions is not an object'));
    });

    test.each(['', 1])('drops dataURLOptions.type that is not a non-empty string (%p)', (type) => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        canvas: {
          enabled: false,
          dataURLOptions: { type: type as string, quality: Number.POSITIVE_INFINITY },
        },
      });
      expect(config.canvas).toEqual({ enabled: false });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('type is not a non-empty string'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('quality is not a finite number'));
    });
  });

  describe('enableTransportCompression', () => {
    test('defaults to true when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: new Logger() });
      expect(config.enableTransportCompression).toBe(true);
    });

    test('respects explicit false (opt-out)', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: new Logger(),
        enableTransportCompression: false,
      });
      expect(config.enableTransportCompression).toBe(false);
    });

    test('respects explicit true', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: new Logger(),
        enableTransportCompression: true,
      });
      expect(config.enableTransportCompression).toBe(true);
    });
  });

  describe('eagerFullSnapshotSend', () => {
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
    });

    test('is undefined when option is omitted (defaults to eager send downstream)', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.eagerFullSnapshotSend).toBeUndefined();
    });

    test('passes through false', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        eagerFullSnapshotSend: false,
      });
      expect(config.eagerFullSnapshotSend).toBe(false);
    });

    test('passes through true', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        eagerFullSnapshotSend: true,
      });
      expect(config.eagerFullSnapshotSend).toBe(true);
    });
  });

  describe('captureFullSnapshotOnFocus', () => {
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
    });

    test('defaults to false when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.captureFullSnapshotOnFocus).toBe(false);
    });

    test('passes through false', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        captureFullSnapshotOnFocus: false,
      });
      expect(config.captureFullSnapshotOnFocus).toBe(false);
    });

    test('passes through true', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        captureFullSnapshotOnFocus: true,
      });
      expect(config.captureFullSnapshotOnFocus).toBe(true);
    });
  });

  describe('maxPersistedEventsSizeBytes', () => {
    let warnSpy: jest.SpyInstance;
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {
        /* swallow */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('is undefined when option is omitted (defaults to MAX_EVENT_LIST_SIZE downstream)', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.maxPersistedEventsSizeBytes).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through an in-range value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: 1_000_000,
      });
      expect(config.maxPersistedEventsSizeBytes).toBe(1_000_000);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('clamps a value below the floor and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: 10,
      });
      expect(config.maxPersistedEventsSizeBytes).toBe(1_000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('maxPersistedEventsSizeBytes'));
    });

    test('clamps a value above the ceiling and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: 50_000_000,
      });
      expect(config.maxPersistedEventsSizeBytes).toBe(8_000_000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds ceiling'));
    });

    test('ignores a non-finite value and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: Number.NaN,
      });
      expect(config.maxPersistedEventsSizeBytes).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a finite number'));
    });
  });

  describe('maxSingleEventSizeBytes', () => {
    let warnSpy: jest.SpyInstance;
    let logger: ILogger;

    beforeEach(() => {
      logger = new Logger();
      warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {
        /* swallow */
      });
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    test('is undefined when option is omitted (defaults to MAX_SINGLE_EVENT_SIZE downstream)', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.maxSingleEventSizeBytes).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through an in-range value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: 5_000_000,
      });
      expect(config.maxSingleEventSizeBytes).toBe(5_000_000);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('clamps a value below the floor and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: 100,
      });
      expect(config.maxSingleEventSizeBytes).toBe(1_000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('is below floor'));
    });

    test('clamps a value above the ceiling and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: 50_000_000,
      });
      expect(config.maxSingleEventSizeBytes).toBe(10_000_000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('maxSingleEventSizeBytes'));
    });

    test('ignores a non-finite value and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: Number.POSITIVE_INFINITY,
      });
      expect(config.maxSingleEventSizeBytes).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a finite number'));
    });
  });
});
