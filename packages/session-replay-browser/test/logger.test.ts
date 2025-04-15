import { ILogger, LogLevel } from '@amplitude/analytics-core';
import { SafeLoggerProvider } from '../src/logger';

describe('SafeLoggerProvider', () => {
  let mockLogger: jest.Mocked<ILogger>;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let enableSpy: jest.SpyInstance;
  let disableSpy: jest.SpyInstance;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
    };

    logSpy = jest.spyOn(mockLogger, 'log');
    warnSpy = jest.spyOn(mockLogger, 'warn');
    errorSpy = jest.spyOn(mockLogger, 'error');
    debugSpy = jest.spyOn(mockLogger, 'debug');
    enableSpy = jest.spyOn(mockLogger, 'enable');
    disableSpy = jest.spyOn(mockLogger, 'disable');
  });

  test('calls original console methods when they exist', () => {
    const safeLogger = new SafeLoggerProvider(mockLogger);

    safeLogger.log('test log');
    expect(logSpy).toHaveBeenCalledWith('test log');

    safeLogger.warn('test warn');
    expect(warnSpy).toHaveBeenCalledWith('test warn');

    safeLogger.error('test error');
    expect(errorSpy).toHaveBeenCalledWith('test error');

    safeLogger.debug('test debug');
    expect(debugSpy).toHaveBeenCalledWith('test debug');
  });

  test('calls original console methods if they use rrweb’s __rrweb_original__ method', () => {
    const originalLog = jest.fn();
    mockLogger.log = jest.fn();
    (mockLogger.log as unknown as { __rrweb_original__: typeof originalLog }).__rrweb_original__ = originalLog;

    const safeLogger = new SafeLoggerProvider(mockLogger);
    safeLogger.log('test rrweb log');

    expect(originalLog).toHaveBeenCalledWith('test rrweb log');
    expect(logSpy).not.toHaveBeenCalled();
  });

  test('falls back to no-op when logger is null', () => {
    // @ts-expect-error For testing, pass null
    const safeLogger = new SafeLoggerProvider(null);

    expect(() => safeLogger.log('test log')).not.toThrow();
    expect(() => safeLogger.warn('test warn')).not.toThrow();
    expect(() => safeLogger.error('test error')).not.toThrow();
    expect(() => safeLogger.debug('test debug')).not.toThrow();
  });

  test('falls back to no-op when the logger’s methods are not functions', () => {
    mockLogger.log = 'not a function' as unknown as jest.Mock;
    mockLogger.warn = undefined as unknown as jest.Mock;
    mockLogger.error = null as unknown as jest.Mock;
    mockLogger.debug = jest.fn();

    const safeLogger = new SafeLoggerProvider(mockLogger);

    safeLogger.log('test log');
    safeLogger.warn('test warn');
    safeLogger.error('test error');
    safeLogger.debug('test debug');

    expect(() => safeLogger.log('test log')).not.toThrow();
    expect(() => safeLogger.warn('test warn')).not.toThrow();
    expect(() => safeLogger.error('test error')).not.toThrow();
    expect(() => safeLogger.debug('test debug')).not.toThrow();
  });

  test('enable(logLevel) calls logger.enable(logLevel)', () => {
    const safeLogger = new SafeLoggerProvider(mockLogger);
    jest.spyOn(mockLogger, 'enable');

    safeLogger.enable(LogLevel.Warn);
    expect(enableSpy).toHaveBeenCalledWith(LogLevel.Warn);
  });

  test('disable() calls logger.disable()', () => {
    const safeLogger = new SafeLoggerProvider(mockLogger);
    jest.spyOn(mockLogger, 'disable');

    safeLogger.disable();
    expect(disableSpy).toHaveBeenCalled();
  });
});
