import { DataExtractor } from '@amplitude/plugin-autocapture-browser';

/**
 * Apply an element-selector config to one SDK instance's selector runtime.
 *
 * Selector state (the engine and the shadow-DOM gate) is scoped to the SDK instance's
 * BrowserConfig, so two instances on a page never share it. A page can therefore only reach that
 * state through something the instance hands out, and plugin setup is where the config is handed
 * over. Production arms this from remote config; pages that run with `fetchRemoteConfig: false`
 * use this to arm the same runtime the instance's autocapture plugin reads.
 *
 * Resolves once the config has been applied, which — for a shadow-DOM config — is also when the
 * gate's arming has run the observables' shadow discovery scans.
 *
 * @param client - an initialized SDK instance (the `@amplitude/analytics-browser` module itself,
 *   or a `createInstance()` client).
 * @param remote - an `ElementSelectorRemoteConfig` payload, e.g.
 *   `{ enabled: true, shadowDomEnabled: true, maxShadowDomDepth: 3 }`.
 */
export async function armSelectorConfig(client, remote) {
  const dataExtractor = new DataExtractor({});
  await client.add({
    name: 'harness-selector-config',
    type: 'enrichment',
    setup: async (config) => {
      dataExtractor.bindSelectorRuntime(config);
      dataExtractor.updateSelectorConfig(remote, config.loggerProvider);
    },
    execute: async (event) => event,
  }).promise;
}
