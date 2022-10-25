export interface Logger {
  disable(): void;
  enable(logLevel: LogLevel): void;
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  debug(...args: any[]): void;
}

export enum LogLevel {
  None = 0,
  Error = 1,
  Warn = 2,
  Verbose = 3,
  Debug = 4,
}

export interface LogConfig {
  logger: Logger;
  logLevel: LogLevel;
}
