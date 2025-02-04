import { getGlobalScope } from '@amplitude/analytics-client-common';
import { AmplitudeUnified } from './index';

// https://developer.mozilla.org/en-US/docs/Glossary/IIFE
(function () {
  const GlobalScope = getGlobalScope();

  if (!GlobalScope) {
    console.error('[Amplitude] Error: GlobalScope is not defined');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  GlobalScope.amplitude = new AmplitudeUnified();
})();
