import { createDefaultAutocaptureOptions, createDefaultSubOptions } from './autocapture-options.js';
import { CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_OPTIONS } from './engagement-options.js';
import { createDefaultValues } from './fields.js';
import { SESSION_REPLAY_OPTIONS } from './session-replay-options.js';

// Everything the form holds, in one shape, so it can be diffed against a saved link and restored from
// one. The configuration among it is exactly the arguments buildSnippet() and buildRuntimeConfig() take,
// which is why the run page can rebuild a configuration from nothing but the link the form produced.
export function createDefaultState() {
  return {
    apiKey: '',
    format: 'esm',
    // The site "Run on URL" injects into. No SDK reads it — it rides along so that reopening a link
    // doesn't cost the site the configuration was last tried on.
    targetUrl: '',
    // Stands in for document.referrer on the instrumented tab, so attribution can be tried without
    // having to arrive from the referring site. Only the runner extension can honour it.
    mockReferrer: '',
    // Takes Amplitude's stored state off the site before the run starts, so it begins as a visitor the
    // SDK has never seen. On by default: a run that inherits the last one's device ID and session is the
    // harder thing to reason about, and it's what makes attribution look like it isn't working. Only the
    // runner extension can honour it.
    clearSession: true,
    // Which of the optional blades are in use, keyed as BLADES describes; analytics is always on. The
    // options below belong to one blade each and are only reachable while it is switched on.
    sessionReplay: false,
    engagement: false,
    configOptions: createDefaultValues(CONFIG_OPTIONS),
    autocapture: true,
    autocaptureOptions: createDefaultAutocaptureOptions(),
    autocaptureSubOptions: createDefaultSubOptions(),
    sessionReplayOptions: createDefaultValues(SESSION_REPLAY_OPTIONS),
    engagementOptions: createDefaultValues(ENGAGEMENT_OPTIONS),
  };
}
