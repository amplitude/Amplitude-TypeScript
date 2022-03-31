import * as amplitude from './index';
import { runQueuedFunctions } from './utils/snippet-helper';

globalThis.amplitude = Object.assign(globalThis.amplitude || {}, amplitude);

if (globalThis.amplitude.invoked) {
  const queue = globalThis.amplitude._q;
  globalThis.amplitude._q = [];
  runQueuedFunctions(amplitude, queue);
}
