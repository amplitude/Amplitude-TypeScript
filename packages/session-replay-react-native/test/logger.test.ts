import { createSessionReplayLogger } from '../src/logger';
import { LogLevel } from '@amplitude/analytics-types';

describe('Logger', () => {
  let logger: ReturnType<typeof createSessionReplayLogger>;
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => undefined),
      error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
    };

    logger = createSessionReplayLogger();
  });

  afterEach(() => {
    // Restore console methods
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('createSessionReplayLogger', () => {
    it('should create a logger instance with default log level', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.setLogLevel).toBe('function');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have Warn as default log level', () => {
      // At Warn level, debug and log should not output
      logger.debug('debug message');
      logger.log('log message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('setLogLevel', () => {
    it('should change the log level', () => {
      logger.setLogLevel(LogLevel.Debug);

      // Now debug should work
      logger.debug('debug message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Debug]:', 'debug message');
    });

    it('should accept different log levels', () => {
      logger.setLogLevel(LogLevel.Error);

      // Only error should work, warn should not
      logger.warn('warning message');
      logger.error('error message');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledWith('Amplitude Session Replay [Error]:', 'error message');
    });
  });

  describe('log', () => {
    it('should log messages when log level is Verbose or lower', () => {
      logger.setLogLevel(LogLevel.Verbose);
      logger.log('test message');

      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Log]:', 'test message');
    });

    it('should not log when log level is higher than Verbose', () => {
      logger.setLogLevel(LogLevel.Warn);
      logger.log('test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      logger.setLogLevel(LogLevel.Verbose);
      logger.log('message', 'arg1', 'arg2');

      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Log]:', 'message', 'arg1', 'arg2');
    });
  });

  describe('warn', () => {
    it('should warn when log level is Warn or lower', () => {
      logger.setLogLevel(LogLevel.Warn);
      logger.warn('warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith('Amplitude Session Replay [Warn]:', 'warning message');
    });

    it('should not warn when log level is higher than Warn', () => {
      logger.setLogLevel(LogLevel.Error);
      logger.warn('warning message');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      logger.setLogLevel(LogLevel.Warn);
      logger.warn('warning', 'arg1', 'arg2');

      expect(consoleSpy.warn).toHaveBeenCalledWith('Amplitude Session Replay [Warn]:', 'warning', 'arg1', 'arg2');
    });
  });

  describe('error', () => {
    it('should error when log level is Error or lower', () => {
      logger.setLogLevel(LogLevel.Error);
      logger.error('error message');

      expect(consoleSpy.error).toHaveBeenCalledWith('Amplitude Session Replay [Error]:', 'error message');
    });

    it('should not error when log level is higher than Error', () => {
      logger.setLogLevel(LogLevel.None);
      logger.error('error message');

      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      logger.setLogLevel(LogLevel.Error);
      logger.error('error', 'arg1', 'arg2');

      expect(consoleSpy.error).toHaveBeenCalledWith('Amplitude Session Replay [Error]:', 'error', 'arg1', 'arg2');
    });

    it('should handle Error objects', () => {
      logger.setLogLevel(LogLevel.Error);
      const testError = new Error('Test error');
      logger.error('Error occurred:', testError);

      expect(consoleSpy.error).toHaveBeenCalledWith('Amplitude Session Replay [Error]:', 'Error occurred:', testError);
    });
  });

  describe('debug', () => {
    it('should debug when log level is Debug or lower', () => {
      logger.setLogLevel(LogLevel.Debug);
      logger.debug('debug message');

      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Debug]:', 'debug message');
    });

    it('should not debug when log level is higher than Debug', () => {
      logger.setLogLevel(LogLevel.Warn);
      logger.debug('debug message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should handle multiple arguments', () => {
      logger.setLogLevel(LogLevel.Debug);
      logger.debug('debug', 'arg1', 'arg2');

      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Debug]:', 'debug', 'arg1', 'arg2');
    });
  });

  describe('log level hierarchy', () => {
    it('should respect log level hierarchy', () => {
      // Test at Debug level - all should work
      logger.setLogLevel(LogLevel.Debug);

      logger.debug('debug');
      logger.log('log');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.log).toHaveBeenCalledTimes(2); // debug + log
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy at Verbose level', () => {
      logger.setLogLevel(LogLevel.Verbose);

      logger.debug('debug');
      logger.log('log');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1); // only log (debug won't work at Verbose)
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy at Warn level', () => {
      logger.setLogLevel(LogLevel.Warn);

      logger.debug('debug');
      logger.log('log');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy at Error level', () => {
      logger.setLogLevel(LogLevel.Error);

      logger.debug('debug');
      logger.log('log');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('should respect log level hierarchy at None level', () => {
      logger.setLogLevel(LogLevel.None);

      logger.debug('debug');
      logger.log('log');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });

  describe('prefix formatting', () => {
    it('should include correct prefix for all log levels', () => {
      logger.setLogLevel(LogLevel.Debug);

      logger.debug('debug message');
      logger.log('log message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Debug]:', 'debug message');
      expect(consoleSpy.log).toHaveBeenCalledWith('Amplitude Session Replay [Log]:', 'log message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('Amplitude Session Replay [Warn]:', 'warn message');
      expect(consoleSpy.error).toHaveBeenCalledWith('Amplitude Session Replay [Error]:', 'error message');
    });
  });
});
