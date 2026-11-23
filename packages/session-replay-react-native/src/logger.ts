import { LogLevel } from '@amplitude/analytics-types';

export const createSessionReplayLogger = () => {
  let logLevel: LogLevel = LogLevel.Warn;

  return {
    setLogLevel: function setLogLevel(level: LogLevel): void {
      logLevel = level;
    },

    log: function log(...args: unknown[]): void {
      if (logLevel < LogLevel.Verbose) {
        return;
      }
      console.log('Amplitude Session Replay [Log]:', ...args);
    },

    warn: function warn(...args: unknown[]): void {
      if (logLevel < LogLevel.Warn) {
        return;
      }
      console.warn('Amplitude Session Replay [Warn]:', ...args);
    },

    error: function error(...args: unknown[]): void {
      if (logLevel < LogLevel.Error) {
        return;
      }
      console.error('Amplitude Session Replay [Error]:', ...args);
    },

    debug: function debug(...args: unknown[]): void {
      if (logLevel < LogLevel.Debug) {
        return;
      }
      console.log('Amplitude Session Replay [Debug]:', ...args);
    },
  };
};
