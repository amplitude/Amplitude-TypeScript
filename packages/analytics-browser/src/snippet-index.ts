import * as amplitude from './index';
import { runQueuedFunctions } from './utils/snippet-helper';

window.amplitude = Object.assign(window.amplitude, amplitude);

if (window.amplitude?.invoked) {
  runQueuedFunctions(amplitude, window.amplitude);
}
