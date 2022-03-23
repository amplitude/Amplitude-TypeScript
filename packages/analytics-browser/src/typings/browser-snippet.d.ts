import type { init, runQueuedFunctions } from '../index';

type Amplitude = {
  init?: typeof init;
  runQueuedFunctions?: typeof runQueuedFunctions;
  _q: Array<[string, []]>;
  _iq: Record<string, Amplitude>;
} & Record<string, () => void>;

declare global {
  interface Window {
    amplitude: Amplitude;
  }
}
