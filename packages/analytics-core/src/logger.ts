import { LogLevel, Logger as ILogger } from '@amplitude/analytics-types';

const PREFIX = 'Amplitude Logger ';

export class Logger implements ILogger {
  logLevel: LogLevel;

  constructor() {
    this.logLevel = 0;
  }

  disable(): void {
    this.logLevel = 0;
  }

  enable(logLevel: LogLevel = LogLevel.Warn): void {
    this.logLevel = logLevel;
  }

  log(...args: any[]): void {
    if (this.logLevel < LogLevel.Verbose) {
      return;
    }
    console.log(`${PREFIX}[Log]: ${args.join(' ')}`);
  }

  warn(...args: any[]): void {
    if (this.logLevel < LogLevel.Warn) {
      return;
    }
    console.warn(`${PREFIX}[Warn]: ${args.join(' ')}`);
  }

  error(...args: any[]): void {
    if (this.logLevel < LogLevel.Error) {
      return;
    }
    console.error(`${PREFIX}[Error]: ${args.join(' ')}`);
  }
}
