import { createInstance as createBaseInstance } from '@amplitude/analytics-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { context } from './plugins/context';
import { BrowserClient, BrowserOptions } from '@amplitude/analytics-types';

export const createInstance = (): BrowserClient => {
  const client = createBaseInstance();

  const _init = async (options: BrowserOptions & { apiKey: string }) => {
    const { apiKey, userId, ...restOfOptions } = options;
    const browserOptions: BrowserOptions = restOfOptions;
    await client.add(context()).promise;
    await client.init(options.apiKey, options.userId, browserOptions).promise;
  };

  return {
    ...client,
    init: (apiKey: string, userId?: string, options: BrowserOptions = {}) =>
      returnWrapper(
        _init({
          ...options,
          userId,
          apiKey,
        }),
      ),
  };
};

export default createInstance();
