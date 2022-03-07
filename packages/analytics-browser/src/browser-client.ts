import { init as _init } from '@amplitude/analytics-core';
import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';
import { defaultConfig } from './config';

export const init = (apiKey: string, userId?: string, options?: Partial<InitOptions<BrowserConfig>>) => {
  _init<BrowserConfig>(apiKey, userId, {
    ...defaultConfig,
    ...options,
  });
};
