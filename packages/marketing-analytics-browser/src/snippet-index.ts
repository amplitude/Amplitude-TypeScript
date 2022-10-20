import { getGlobalScope } from '@amplitude/analytics-client-common';
import * as amplitude from './index';
import { runQueuedFunctions } from '@amplitude/analytics-browser';

// https://developer.mozilla.org/en-US/docs/Glossary/IIFE
(function () {
  const GlobalScope = getGlobalScope();

  if (!GlobalScope) {
    console.error('[Amplitude] Error: GlobalScope is not defined');
    return;
  }

  GlobalScope.amplitude = Object.assign(GlobalScope.amplitude || {}, amplitude);

  if (GlobalScope.amplitude.invoked) {
    const queue = GlobalScope.amplitude._q;
    GlobalScope.amplitude._q = [];
    runQueuedFunctions(amplitude, queue);

    for (let i = 0; i < GlobalScope.amplitude._iq.length; i++) {
      const instance = Object.assign(GlobalScope.amplitude._iq[i], amplitude.createInstance());
      const queue = instance._q;
      instance._q = [];
      runQueuedFunctions(instance, queue);
    }
  }
})();
