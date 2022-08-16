import * as amplitude from './index';
import { runQueuedFunctions } from './utils/snippet-helper';

globalThis.amplitude = Object.assign(globalThis.amplitude || {}, amplitude);

if (globalThis.amplitude.invoked) {
  const queue = globalThis.amplitude._q;
  globalThis.amplitude._q = [];
  runQueuedFunctions(amplitude, queue);

  for (let i = 0; i < globalThis.amplitude._iq.length; i++) {
    const instance = Object.assign(globalThis.amplitude._iq[i], amplitude.createInstance());
    const queue = instance._q;
    instance._q = [];
    runQueuedFunctions(instance, queue);
  }
}
