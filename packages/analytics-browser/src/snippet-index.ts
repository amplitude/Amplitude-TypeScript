import * as amplitude from './index';
import { runQueuedFunctions } from './browser-client';

window.amplitude = Object.assign(window.amplitude, amplitude);

if (window.amplitude?.invoked) {
  runQueuedFunctions(amplitude, window.amplitude);
}
