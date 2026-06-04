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

    test('is undefined when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.flushIntervalConfig).toBeUndefined();
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

    test('is undefined when option is omitted (defaults to on-focus snapshot downstream)', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.captureFullSnapshotOnFocus).toBeUndefined();
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

    test('clamps a value below the floor', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: 10,
      });
      expect(config.maxPersistedEventsSizeBytes).toBe(1_000);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('clamps a value above the ceiling', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: 50_000_000,
      });
      expect(config.maxPersistedEventsSizeBytes).toBe(8_000_000);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('ignores a non-finite value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxPersistedEventsSizeBytes: Infinity,
      });
      expect(config.maxPersistedEventsSizeBytes).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
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

    test('clamps a value below the floor', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: 0,
      });
      expect(config.maxSingleEventSizeBytes).toBe(1_000);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('clamps a value above the ceiling', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: 50_000_000,
      });
      expect(config.maxSingleEventSizeBytes).toBe(10_000_000);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('ignores a non-finite value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        maxSingleEventSizeBytes: NaN,
      });
      expect(config.maxSingleEventSizeBytes).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
