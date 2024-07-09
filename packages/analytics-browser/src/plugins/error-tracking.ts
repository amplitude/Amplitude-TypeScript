import { BrowserClient, EnrichmentPlugin } from '@amplitude/analytics-types';
import { DEFAULT_ERROR_LOGGED_EVENT } from '../constants';
import { BrowserConfig } from '../config';
import { getGlobalScope } from '@amplitude/analytics-client-common';

export const errorTrackingPlugin = (): EnrichmentPlugin => {
  const name = '@amplitude/plugin-error-tracking-browser';
  const type = 'enrichment';

  const setup = async (config: BrowserConfig, amplitude: BrowserClient) => {
    config.loggerProvider.debug('Installing error tracking plugin.');

    const globalScope = getGlobalScope();
    if (!globalScope || typeof globalScope.addEventListener !== 'function') {
      config.loggerProvider.warn('Error tracking requires a global scope with an event listener.');
      return;
    }

    const errorHandler = (
      message: string | ErrorEvent,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error,
    ) => {
      console.log(JSON.stringify(error));

      amplitude.track(DEFAULT_ERROR_LOGGED_EVENT, {
        'Error Type': 'UI Crash',
        'Error Message': typeof message === 'string' ? message : JSON.stringify(ErrorEvent),
        'Error Source': source, // The URL of the script where the error was raised
        'Error Lineno': lineno, // The line number in the script where the error occurred
        'Error Colno': colno, // The column number in the script where the error occurred
        'Error Stack Trace': error?.stack || 'No stack trace available',
      });
    };

    globalScope.addEventListener('error', errorHandler);
  };

  const teardown = async () => {
    const globalScope = getGlobalScope();
    if (globalScope && typeof globalScope.removeEventListener === 'function') {
      globalScope.onerror = null;
    }
  };

  return {
    name,
    type,
    setup,
    teardown,
  };
};
