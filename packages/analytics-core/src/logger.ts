import { LogLevel } from './types/loglevel';

const PREFIX = 'Amplitude Logger ';

export interface ILogger {
  disable(): void;
  enable(logLevel: LogLevel): void;
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  debug(...args: any[]): void;
}

export interface LogConfig {
  logger: ILogger;
  logLevel: LogLevel;
}

type TimeKey = 'start' | 'end';

export interface DebugContext {
  type: string;
  name: string;
  args: string[] | string;
  stacktrace?: string[] | string;
  time?: { [key in TimeKey]?: string };
  states?: { [key: string]: any };
}

export class Logger implements ILogger {
  logLevel: LogLevel;

  constructor() {
    this.logLevel = LogLevel.None;
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

  debug(...args: any[]): void {
    if (this.logLevel < LogLevel.Debug) {
      return;
    }
    // console.debug output is hidden by default in chrome
    console.log(`${PREFIX}[Debug]: ${args.join(' ')}`);
  }
}
