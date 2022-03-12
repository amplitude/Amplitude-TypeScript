import { LogLevel } from '@amplitude/analytics-types';
import { Logger } from '../src/logger';

jest.unmock('../src/logger');

describe('logger', () => {
  describe('enable/disable', () => {
    test('should set log level to 0', () => {
      const logger = new Logger();
      expect(logger.logLevel).toBe(0);
      logger.enable();
      expect(logger.logLevel).toBe(2);
      logger.enable(LogLevel.Error);
      expect(logger.logLevel).toBe(1);
      logger.disable();
      expect(logger.logLevel).toBe(0);
    });
  });

  describe('log', () => {
    test('should log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.Verbose);
      const log = jest.spyOn(console, 'log').mockReturnValueOnce(undefined);
      logger.log('Success');
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Amplitude Logger [Log]: Success');
    });

    test('should not log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.Warn);
      const log = jest.spyOn(console, 'log');
      logger.log('Success');
      expect(log).toHaveBeenCalledTimes(0);
    });
  });

  describe('warn', () => {
    test('should log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.Warn);
      const log = jest.spyOn(console, 'warn').mockReturnValueOnce(undefined);
      logger.warn('Success');
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Amplitude Logger [Warn]: Success');
    });

    test('should not log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.Error);
      const log = jest.spyOn(console, 'warn');
      logger.warn('Success');
      expect(log).toHaveBeenCalledTimes(0);
    });
  });

  describe('error', () => {
    test('should log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.Error);
      const log = jest.spyOn(console, 'error').mockReturnValueOnce(undefined);
      logger.error('Success');
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith('Amplitude Logger [Error]: Success');
    });

    test('should not log event', () => {
      const logger = new Logger();
      logger.enable(LogLevel.None);
      const log = jest.spyOn(console, 'error');
      logger.error('Success');
      expect(log).toHaveBeenCalledTimes(0);
    });
  });
});
