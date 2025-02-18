import { LogLevel, Logger as ILogger } from '@amplitude/analytics-types';

const PREFIX = 'Amplitude Logger ';

export class Logger implements ILogger {
  logLevel: LogLevel;

  private readonly defaultLog: typeof console.log;
  private readonly defaultWarn: typeof console.warn;
  private readonly defaultError: typeof console.error;

  constructor() {
    this.logLevel = LogLevel.None;
    this.defaultLog = Logger.getDefaultConsoleMethod(console.log);
    this.defaultWarn = Logger.getDefaultConsoleMethod(console.warn);
    this.defaultError = Logger.getDefaultConsoleMethod(console.error);
  }

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

    this.defaultLog(`${PREFIX}[Log]: ${args.join(' ')}`);
  }

  warn(...args: any[]): void {
    if (this.logLevel < LogLevel.Warn) {
      return;
    }
    this.defaultWarn(`${PREFIX}[Warn]: ${args.join(' ')}`);
  }

  error(...args: any[]): void {
    if (this.logLevel < LogLevel.Error) {
      return;
    }
    this.defaultError(`${PREFIX}[Error]: ${args.join(' ')}`);
  }

  debug(...args: any[]): void {
    if (this.logLevel < LogLevel.Debug) {
      return;
    }
    // console.debug output is hidden by default in chrome
    this.defaultLog(`${PREFIX}[Debug]: ${args.join(' ')}`);
  }

  private static getDefaultConsoleMethod<T extends (...args: any[]) => void>(method: T): T {
    return (method as { __rrweb_original__?: T })['__rrweb_original__'] || method;
  }
}
