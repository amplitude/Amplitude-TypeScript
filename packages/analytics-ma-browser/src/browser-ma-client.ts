import { createInstance as createBrowserInstance } from '@amplitude/analytics-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { BrowserMaClient, BrowserMaOptions } from './typings/browser-ma-client';

export const createInstance = (): BrowserMaClient => {
  const client = createBrowserInstance();

  const init = async (apiKey: string, userId?: string, options?: BrowserMaOptions) => {
    if (!options?.attribution?.disabled) {
      await client.add(webAttributionPlugin(client, options?.attribution)).promise;
    }
    if (options?.trackPageViews) {
      const pageViewTrackingPluginOptions = typeof options.trackPageViews === 'boolean' ? {} : options.trackPageViews;
      await client.add(pageViewTrackingPlugin(client, pageViewTrackingPluginOptions)).promise;
    }
    await client.init(apiKey, userId, options).promise;
  };

  return {
    ...client,
    init: returnWrapper(init.bind(client)),
  };
};

export default createInstance();
