import * as amplitude from './index';
import { runQueuedFunctions, GlobalScope } from '@amplitude/analytics-browser';

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
