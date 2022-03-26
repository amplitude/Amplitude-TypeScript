import type { AmplitudeProxy } from './typings/browser-snippet';
import * as amplitude from './index';
import { runQueuedFunctions } from './browser-client';

const amplitudeProxy = <AmplitudeProxy>window.amplitude;
window.amplitude = amplitude;

if (amplitudeProxy?.invoked) {
  runQueuedFunctions(amplitudeProxy);
}
