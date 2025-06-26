import { Logger, LogLevel } from '@amplitude/analytics-types';

const PREFIX = 'Amplitude Session Replay ';

export class SessionReplayLogger implements Logger {
  private logLevel: LogLevel = LogLevel.None;

  disable(): void {
    this.logLevel = LogLevel.None;
  }

  enable(logLevel: LogLevel = LogLevel.Warn): void {
    this.logLevel = logLevel;
  }

  log(...args: any[]): void {
    if (this.logLevel < LogLevel.Verbose) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.log(`${PREFIX}[Log]:`, ...args);
  }

  warn(...args: any[]): void {
    if (this.logLevel < LogLevel.Warn) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.warn(`${PREFIX}[Warn]:`, ...args);
  }

  error(...args: any[]): void {
    if (this.logLevel < LogLevel.Error) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.error(`${PREFIX}[Error]:`, ...args);
  }

  debug(...args: any[]): void {
    if (this.logLevel < LogLevel.Debug) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.log(`${PREFIX}[Debug]:`, ...args);
  }
}
