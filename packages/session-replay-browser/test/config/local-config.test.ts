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

    test('clamps non-finite values (NaN, Infinity) to the floor', () => {
      const config = new SessionReplayLocalConfig('static_key', {
        loggerProvider: logger,
        flushIntervalConfig: { minIntervalMs: NaN, maxIntervalMs: Infinity },
      });
      expect(config.flushIntervalConfig?.minIntervalMs).toBe(100);
      expect(config.flushIntervalConfig?.maxIntervalMs).toBe(100);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('minIntervalMs'));
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
});
