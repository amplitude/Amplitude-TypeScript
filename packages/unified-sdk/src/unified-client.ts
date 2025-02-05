import {
  AmplitudeReturn,
  BrowserOptions,
  BrowserClient,
  EventOptions,
  Result,
  BaseEvent,
  TransportType,
  BrowserConfig,
  Plugin,
  Identify,
  Revenue,
} from '@amplitude/analytics-types';
import { Client, Experiment, ExperimentConfig } from '@amplitude/experiment-js-client';
import { sessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { returnWrapper } from '@amplitude/analytics-core';
import { SessionReplayOptions } from '@amplitude/plugin-session-replay-browser/lib/scripts/typings/session-replay';
import { createInstance } from '@amplitude/analytics-browser';

interface UnifiedClient extends Omit<BrowserClient, 'init'> {
  init(
    apiKey: string,
    options?: BrowserOptions,
    srOptions?: SessionReplayOptions,
    experimentOptions?: { deploymentKey?: string; experimentConfig?: ExperimentConfig },
  ): AmplitudeReturn<void>;
}

export class AmplitudeUnified implements UnifiedClient {
  analytics: BrowserClient;
  experiment?: Client;

  constructor() {
    this.analytics = createInstance();
  }

  init(
    apiKey: string,
    options?: BrowserOptions,
    srOptions?: SessionReplayOptions,
    experimentOptions?: { deploymentKey: string; experimentConfig?: ExperimentConfig },
  ) {
    // Initialize analytics SDK
    this.analytics.init(apiKey, options);

    // Install SR plugin
    const srPlugin = sessionReplayPlugin(srOptions);
    this.analytics.add(srPlugin);

    // Initialize experiment SDK
    if (experimentOptions) {
      this.experiment = Experiment.initializeWithAmplitudeAnalytics(
        experimentOptions.deploymentKey,
        experimentOptions.experimentConfig,
      );
    }

    return returnWrapper(Promise.resolve());
  }

  add(plugin: Plugin<BrowserClient, BrowserConfig>): AmplitudeReturn<void> {
    return this.analytics.add(plugin);
  }

  extendSession(): void {
    return this.analytics.extendSession();
  }

  flush(): AmplitudeReturn<void> {
    return this.analytics.flush();
  }

  getDeviceId(): string | undefined {
    return this.analytics.getDeviceId();
  }

  getSessionId(): number | undefined {
    return this.analytics.getSessionId();
  }

  getUserId(): string | undefined {
    return this.analytics.getUserId();
  }

  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: Identify,
    eventOptions: EventOptions | undefined,
  ): AmplitudeReturn<Result> {
    return this.analytics.groupIdentify(groupType, groupName, identify, eventOptions);
  }

  identify(identify: Identify, eventOptions: EventOptions | undefined): AmplitudeReturn<Result> {
    return this.analytics.identify(identify, eventOptions);
  }

  logEvent(
    eventInput: BaseEvent | string,
    eventProperties: Record<string, any> | undefined,
    eventOptions: EventOptions | undefined,
  ): AmplitudeReturn<Result> {
    return this.analytics.logEvent(eventInput, eventProperties, eventOptions);
  }

  remove(pluginName: string): AmplitudeReturn<void> {
    return this.analytics.remove(pluginName);
  }

  reset(): void {
    return this.analytics.reset();
  }

  revenue(revenue: Revenue, eventOptions: EventOptions | undefined): AmplitudeReturn<Result> {
    return this.analytics.revenue(revenue, eventOptions);
  }

  setDeviceId(deviceId: string): void {
    return this.analytics.setDeviceId(deviceId);
  }

  setGroup(
    groupType: string,
    groupName: string | string[],
    eventOptions: EventOptions | undefined,
  ): AmplitudeReturn<Result> {
    return this.analytics.setGroup(groupType, groupName, eventOptions);
  }

  setOptOut(optOut: boolean): void {
    return this.analytics.setOptOut(optOut);
  }

  setSessionId(sessionId: number): void {
    return this.analytics.setSessionId(sessionId);
  }

  setTransport(transport: TransportType): void {
    return this.analytics.setTransport(transport);
  }

  setUserId(userId: string | undefined): void {
    return this.analytics.setUserId(userId);
  }

  track(
    eventInput: BaseEvent | string,
    eventProperties: Record<string, any> | undefined,
    eventOptions: EventOptions | undefined,
  ): AmplitudeReturn<Result> {
    return this.analytics.track(eventInput, eventProperties, eventOptions);
  }
}
