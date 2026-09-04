import { createDefaultAutocaptureOptions, createDefaultSubOptions } from './autocapture-options.js';
import { CONFIG_OPTIONS } from './config-options.js';
import { ENGAGEMENT_OPTIONS } from './engagement-options.js';
import { createDefaultValues } from './fields.js';
import { SESSION_REPLAY_OPTIONS } from './session-replay-options.js';

// Everything the form holds, in one shape, so it can be diffed against a saved link and restored from
// one. These are also exactly the arguments buildSnippet() and buildRuntimeConfig() take, which is why
// the run page can rebuild a configuration from nothing but the link the form produced.
export function createDefaultState() {
  return {
    apiKey: '',
    format: 'esm',
    configOptions: createDefaultValues(CONFIG_OPTIONS),
    autocapture: true,
    autocaptureOptions: createDefaultAutocaptureOptions(),
    autocaptureSubOptions: createDefaultSubOptions(),
    sessionReplay: false,
    sessionReplayOptions: createDefaultValues(SESSION_REPLAY_OPTIONS),
    engagement: false,
    engagementOptions: createDefaultValues(ENGAGEMENT_OPTIONS),
  };
}
