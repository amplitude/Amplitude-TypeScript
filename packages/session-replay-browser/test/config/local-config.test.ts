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

  describe('deferFullSnapshot', () => {
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

    test('is undefined (deferral off) when option is omitted', () => {
      const config = new SessionReplayLocalConfig('static_key', { loggerProvider: logger });
      expect(config.deferFullSnapshot).toBeUndefined();
    });

    test('resolves defaults for every field when only enabled is provided', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true },
      });
      expect(config.deferFullSnapshot).toEqual({ enabled: true, until: 'idle', delayMs: 0, maxWaitMs: 5000 });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('passes through a fully specified valid config', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, until: 'load', delayMs: 500, maxWaitMs: 12_000 },
      });
      expect(config.deferFullSnapshot).toEqual({ enabled: true, until: 'load', delayMs: 500, maxWaitMs: 12_000 });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    test('preserves enabled: false so consumers can toggle without deleting the block', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: false, until: 'load' },
      });
      expect(config.deferFullSnapshot?.enabled).toBe(false);
    });

    test('falls back to idle and warns on an unknown until value', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, until: 'paint' as unknown as 'load' },
      });
      expect(config.deferFullSnapshot?.until).toBe('idle');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deferFullSnapshot.until'));
    });

    test('treats negative / non-finite delayMs as 0 and warns', () => {
      const negative = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, delayMs: -10 },
      });
      expect(negative.deferFullSnapshot?.delayMs).toBe(0);
      const nan = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, delayMs: NaN },
      });
      expect(nan.deferFullSnapshot?.delayMs).toBe(0);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deferFullSnapshot.delayMs'));
    });

    test('falls back to the default maxWaitMs for non-positive / non-finite values and warns', () => {
      const zero = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, maxWaitMs: 0 },
      });
      expect(zero.deferFullSnapshot?.maxWaitMs).toBe(5000);
      const infinite = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, maxWaitMs: Infinity },
      });
      expect(infinite.deferFullSnapshot?.maxWaitMs).toBe(5000);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deferFullSnapshot.maxWaitMs'));
    });

    test('clamps maxWaitMs above the 30s ceiling and warns', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        deferFullSnapshot: { enabled: true, maxWaitMs: 120_000 },
      });
      expect(config.deferFullSnapshot?.maxWaitMs).toBe(30_000);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds ceiling'));
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
