import { ILogger, LogLevel } from '@amplitude/analytics-core';

export class SafeLoggerProvider implements ILogger {
  private logger: ILogger;

  log: typeof console.log;
  warn: typeof console.warn;
  error: typeof console.error;
  debug: typeof console.debug;

  constructor(loggerProvider: ILogger) {
    this.logger = loggerProvider;
    this.log = this.getSafeMethod('log');
    this.warn = this.getSafeMethod('warn');
    this.error = this.getSafeMethod('error');
    this.debug = this.getSafeMethod('debug');
  }

  private getSafeMethod<K extends keyof ILogger>(method: K): ILogger[K] {
    if (!this.logger) {
      return (() => {
        // No-op function fallback
      }) as ILogger[K];
    }

    const fn = this.logger[method];
    if (typeof fn === 'function') {
      const originalFn = (fn as { __rrweb_original__?: ILogger[K] }).__rrweb_original__ ?? fn;
      return originalFn.bind(this.logger) as ILogger[K];
    }

    return (() => {
      // No-op function fallback
    }) as ILogger[K];
  }

  enable(logLevel: LogLevel) {
    this.logger.enable(logLevel);
  }

  disable() {
    this.logger.disable();
  }
}
