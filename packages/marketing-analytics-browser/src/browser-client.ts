import { createInstance as createBaseInstance } from '@amplitude/analytics-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { context } from './plugins/context';
import { Client, Options } from './typings/browser-client';
import { BrowserOptions } from '@amplitude/analytics-types';

export const createInstance = (): Client => {
  const client = createBaseInstance();

  const _init = async (options: Options & { apiKey: string }) => {
    const { attribution, pageViewTracking, apiKey, userId, ...restOfOptions } = options;
    const browserOptions: BrowserOptions = restOfOptions;

    if (!attribution?.disabled) {
      // Install web attribution plugin
      await client.add(webAttributionPlugin(client, attribution)).promise;
    }
    // Transform config to disable web attribution plugin in browser SDK
    // Browser SDK has a slightly different implementation of web attribution
    browserOptions.attribution = {
      disabled: true,
    };

    await client.add(context()).promise;

    browserOptions.defaultTracking = {
      pageViews: pageViewTracking,
    };

    await client.init(options.apiKey, options.userId, browserOptions).promise;
  };

  return {
    ...client,
    init: (apiKey: string, userId?: string, options: Options = {}) =>
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
