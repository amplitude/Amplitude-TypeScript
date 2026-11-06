import type { BrowserConfig } from '@amplitude/analytics-core';
import { createSelectorEngine, resolveSelectorConfig, type SelectorEngine } from '@amplitude/element-selector';
import { createShadowGate, type ShadowGate } from './shadow-mode';

/**
 * Selector state shared by the autocapture and frustration plugins belonging
 * to one browser SDK instance.
 */
export interface SelectorRuntime {
  engine: SelectorEngine;
  shadowGate: ShadowGate;
}

/**
 * Build dormant selector state. DataExtractor uses a private runtime until its
 * plugin is set up, which keeps standalone DataExtractor consumers independent.
 */
export const createSelectorRuntime = (): SelectorRuntime => ({
  engine: createSelectorEngine(resolveSelectorConfig()),
  shadowGate: createShadowGate(),
});

/**
 * BrowserConfig is the SDK-instance lifecycle boundary: every plugin installed
 * by one BrowserClient receives the same object, while separate SDK instances
 * receive distinct objects even when they use the same API key or instance
 * name. Weak keys let runtimes disappear with their SDK configs.
 */
const runtimesByConfig = new WeakMap<BrowserConfig, SelectorRuntime>();

export const getSelectorRuntime = (config: BrowserConfig): SelectorRuntime => {
  let runtime = runtimesByConfig.get(config);
  if (!runtime) {
    runtime = createSelectorRuntime();
    runtimesByConfig.set(config, runtime);
  }
  return runtime;
};
