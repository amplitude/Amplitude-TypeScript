import { getGlobalScope } from '@amplitude/analytics-client-common';
import * as amplitudeGTM from './index';
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
    if (GlobalScope && GlobalScope.amplitudeGTM && GlobalScope.amplitudeGTM._iq && instanceName) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      GlobalScope.amplitudeGTM._iq[instanceName] = instance;
    }
    return instance;
  };

  GlobalScope.amplitudeGTM = Object.assign(GlobalScope.amplitudeGTM || {}, amplitudeGTM, {
    createInstance: createNamedInstance,
  });

  if (GlobalScope.amplitudeGTM.invoked) {
    const queue = GlobalScope.amplitudeGTM._q;
    GlobalScope.amplitudeGTM._q = [];
    runQueuedFunctions(amplitudeGTM, queue);

    const instanceNames = Object.keys(GlobalScope.amplitudeGTM._iq) || [];
    for (let i = 0; i < instanceNames.length; i++) {
      const instanceName = instanceNames[i];
      const instance = Object.assign(GlobalScope.amplitudeGTM._iq[instanceName], createNamedInstance(instanceName));
      const queue = instance._q;
      instance._q = [];
      runQueuedFunctions(instance, queue);
    }
  }
})();
