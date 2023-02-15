import { createInstance as createBaseInstance } from '@amplitude/analytics-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { context } from './plugins/context';
import { Client, Options } from './typings/browser-client';
import { BrowserOptions } from '@amplitude/analytics-types';

export const createInstance = (): Client => {
  const client = createBaseInstance();

  const _init = async (options: Options & { apiKey: string }) => {
    const { attribution, pageViewTracking, ...restOfOptions } = options;
    const browserOptions: BrowserOptions = restOfOptions;

    if (!attribution?.disabled) {
      await client.add(webAttributionPlugin(client, attribution)).promise;
    }

    if (pageViewTracking) {
      const pageViewTrackingOptions = typeof pageViewTracking === 'boolean' ? {} : pageViewTracking;
      await client.add(pageViewTrackingPlugin(client, pageViewTrackingOptions)).promise;
    }

    await client.add(context()).promise;

    // NOTE: Explicitly disable core web attribution logic in favor of web attribution plugin
    browserOptions.attribution = {
      disabled: true,
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
