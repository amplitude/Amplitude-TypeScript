import { AmplitudeReturn, BrowserOptions, BrowserClient } from '@amplitude/analytics-types';
import { Client, Experiment, ExperimentConfig } from '@amplitude/experiment-js-client';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { SessionReplayOptions } from '@amplitude/plugin-session-replay-browser/lib/scripts/typings/session-replay';
import { AmplitudeBrowser } from '@amplitude/analytics-browser';

interface UnifiedClient extends BrowserClient {
  // Keep existing ones from BrowserClient
  // Those only initialize analytics client
  init(apiKey: string, options?: BrowserOptions): AmplitudeReturn<void>;
  init(apiKey: string, userId?: string, options?: BrowserOptions): AmplitudeReturn<void>;
  // Initialize all blades all at once
  init(
    apiKey: string,
    options?: BrowserOptions,
    srOptions?: SessionReplayOptions,
    experimentOptions?: { deploymentKey?: string; experimentConfig?: ExperimentConfig },
  ): AmplitudeReturn<void>;
}

// Helpers - type guards
// TODO(xinyi): should move it to sr package
function isSessionReplayOptions(obj: unknown): obj is SessionReplayOptions {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const o = obj as SessionReplayOptions;

  return (
    (o.sampleRate === undefined || typeof o.sampleRate === 'number') &&
    (o.privacyConfig === undefined || typeof o.privacyConfig === 'object') &&
    (o.debugMode === undefined || typeof o.debugMode === 'boolean') &&
    (o.forceSessionTracking === undefined || typeof o.forceSessionTracking === 'boolean') &&
    (o.configServerUrl === undefined || typeof o.configServerUrl === 'string') &&
    (o.trackServerUrl === undefined || typeof o.trackServerUrl === 'string') &&
    (o.shouldInlineStylesheet === undefined || typeof o.shouldInlineStylesheet === 'boolean') &&
    (o.performanceConfig === undefined || typeof o.performanceConfig === 'object') &&
    (o.storeType === undefined || typeof o.storeType === 'string') &&
    (o.deviceId === undefined || typeof o.deviceId === 'string') &&
    (o.customSessionId === undefined || typeof o.customSessionId === 'function') &&
    (o.experimental === undefined ||
      (typeof o.experimental === 'object' && typeof o.experimental.useWebWorker === 'boolean'))
  );
}

export class AmplitudeUnified extends AmplitudeBrowser implements UnifiedClient {
  experiment?: Client;

  init(
    apiKey: string,
    userIdOrOptions?: string | BrowserOptions,
    analyticsOrSrOptions?: BrowserOptions | SessionReplayOptions,
    experimentOptions?: { deploymentKey: string; experimentConfig?: ExperimentConfig },
  ) {
    if (arguments.length <= 2) {
      super.init(apiKey, userIdOrOptions);
      return returnWrapper(Promise.resolve());
    }

    // eslint-disable-next-line prefer-rest-params
    if (!isSessionReplayOptions(arguments[2])) {
      super.init(apiKey, userIdOrOptions, analyticsOrSrOptions);
      return returnWrapper(Promise.resolve());
    }

    super.init(apiKey, userIdOrOptions);

    // Install SR plugin
    // this.config.loggerProvider.debug(`Installing session reply plugin with config: ${JSON.stringify(analyticsOrSrOptions, null, 2)}`);
    const srPlugin = sessionReplayPlugin(analyticsOrSrOptions);
    this.add(srPlugin);

    // Initialize experiment SDK
    if (experimentOptions) {
      // this.config.loggerProvider.debug(`Installing experiment SDK with config: ${JSON.stringify(experimentOptions, null, 2)}`);
      this.experiment = Experiment.initializeWithAmplitudeAnalytics(
        experimentOptions.deploymentKey,
        experimentOptions.experimentConfig,
      );
    }

    return returnWrapper(Promise.resolve());
  }
}
