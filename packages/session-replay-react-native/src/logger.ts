import { LogLevel } from '@amplitude/analytics-types';

const PREFIX = 'Amplitude Session Replay ';

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
      console.log(`${PREFIX}[Log]:`, ...args);
    },

    warn: function warn(...args: unknown[]): void {
      if (logLevel < LogLevel.Warn) {
        return;
      }
      console.warn(`${PREFIX}[Warn]:`, ...args);
    },

    error: function error(...args: unknown[]): void {
      if (logLevel < LogLevel.Error) {
        return;
      }
      console.error(`${PREFIX}[Error]:`, ...args);
    },

    debug: function debug(...args: unknown[]): void {
      if (logLevel < LogLevel.Debug) {
        return;
      }
      console.log(`${PREFIX}[Debug]:`, ...args);
    },
  };
};
