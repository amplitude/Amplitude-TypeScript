import { getGlobalScope } from '@amplitude/analytics-client-common';
import * as amplitude from './index';
import { createInstance } from './browser-client-factory';
import { runQueuedFunctions } from './utils/snippet-helper';

// https://developer.mozilla.org/en-US/docs/Glossary/IIFE
(function () {
  const GlobalScope = getGlobalScope();

  if (!GlobalScope) {
    console.error('[Amplitude] Error: GlobalScope is not defined');
    return;
  }

  const createNamedInstance = (instanceName?: string) => {
    const instance = createInstance();
    const GlobalScope = getGlobalScope();
    if (GlobalScope && GlobalScope.amplitude && GlobalScope.amplitude._iq && instanceName) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      GlobalScope.amplitude._iq[instanceName] = instance;
    }
    return instance;
  };

  GlobalScope.amplitude = Object.assign(GlobalScope.amplitude || {}, amplitude, {
    createInstance: createNamedInstance,
  });

  if (GlobalScope.amplitude.invoked) {
    const queue = GlobalScope.amplitude._q;
    GlobalScope.amplitude._q = [];
    runQueuedFunctions(amplitude, queue);

    const instanceNames = Object.keys(GlobalScope.amplitude._iq) || [];
    for (let i = 0; i < instanceNames.length; i++) {
      const instanceName = instanceNames[i];
      const instance = Object.assign(GlobalScope.amplitude._iq[instanceName], createNamedInstance(instanceName));
      const queue = instance._q;
      instance._q = [];
      runQueuedFunctions(instance, queue);
    }
  }
})();
