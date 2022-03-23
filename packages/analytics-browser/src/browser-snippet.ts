/**
 * Imported in client browser via <script> tag
 * Async capabilities: Interally creates stubbed window.amplitude object until real SDK loaded
 * Stubbed functions keep track of funciton calls and their arguments
 * These are sent once real SDK loaded through another <script> tag
 */
import type { Amplitude } from './typings/browser-snippet';

const amplitude = window.amplitude || { _q: [], _iq: {} };
const as = document.createElement('script');
as.type = 'text/javascript';
// Don't edit as.integrity, it is tracked by semantic-release-bot during releases
as.integrity = '{{integrity}}';
as.crossOrigin = 'anonymous';
as.async = true;
// Don't edit as.src, it is tracked by semantic-release-bot during releases
as.src = 'https://cdn.amplitude.com/libs/amplitude-{{version}}-min.gz.js';
as.onload = function () {
  if (!window.amplitude.runQueuedFunctions) {
    console.log('[Amplitude] Error: could not load SDK');
  } else {
    window.amplitude.runQueuedFunctions(amplitude);
  }
};
const s = document.getElementsByTagName('script')[0];
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
s.parentNode!.insertBefore(as, s);

const funcs = '{{amplitudeFunctions}}'.split(',');
function setUpProxy(instance: Amplitude) {
  function proxyMain(fn: string) {
    instance[fn] = function (...args: []) {
      instance._q.push([fn, args]);
    };
  }
  for (let k = 0; k < funcs.length; k++) {
    proxyMain(funcs[k]);
  }
}
setUpProxy(amplitude);
amplitude.init = (apiKey: string) => {
  if (!Object.prototype.hasOwnProperty.call(amplitude._iq, apiKey)) {
    amplitude._iq[apiKey] = <Amplitude>{ _q: <Array<[string, []]>>[] };
    setUpProxy(amplitude._iq[apiKey]);
  }
  return amplitude._iq[apiKey];
};
window.amplitude = amplitude;
