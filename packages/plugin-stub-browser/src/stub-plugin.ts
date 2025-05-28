/* eslint-disable no-restricted-globals */
import { BrowserClient, BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-core';
import { PLUGIN_NAME } from './constants';

export type BrowserEnrichmentPlugin = EnrichmentPlugin<BrowserClient, BrowserConfig>;

export const stubPlugin = (): BrowserEnrichmentPlugin => {
  const setup: BrowserEnrichmentPlugin['setup'] = async (/*config, amplitude*/) => {
    // add logic here to setup any resources
  };

  /* istanbul ignore next */
  const execute: BrowserEnrichmentPlugin['execute'] = async (event) => {
    return event;
  };

  const teardown = async () => {
    // add logic here to clean up any resources
  };

  return {
    name: PLUGIN_NAME,
    type: 'enrichment',
    setup,
    execute,
    teardown,
  };
};
