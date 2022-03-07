import { Fetch } from './transport/fetch';
import { getConfig as _getConfig } from '@amplitude/analytics-core';
import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';

export const defaultConfig: InitOptions<BrowserConfig> = {
  transportProvider: new Fetch(),
  disableCookies: false,
};

export const getConfig = () => {
  return _getConfig<BrowserConfig>();
};
