import { AmplitudeCore, Destination, UUID, returnWrapper } from '@amplitude/analytics-core';
import { CampaignTracker, IdentityEventSender, getAnalyticsConnector } from '@amplitude/analytics-client-common';
import {
  ReactNativeConfig,
  Campaign,
  ReactNativeOptions,
  AttributionOptions,
  ReactNativeClient,
} from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useReactNativeConfig, createFlexibleStorage } from './config';
import { parseOldCookies } from './cookie-migration';
import { isNative } from './utils/platform';

export class AmplitudeReactNative extends AmplitudeCore<ReactNativeConfig> {
  async init(apiKey: string, userId?: string, options?: ReactNativeOptions) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    // Step 1: Read cookies stored by old SDK
    apiKey = apiKey ?? '';
    const oldCookies = await parseOldCookies(apiKey, options);

    // Step 2: Create react native config
    const reactNativeOptions = await useReactNativeConfig(apiKey, userId || oldCookies.userId, {
      ...options,
      deviceId: oldCookies.deviceId ?? options?.deviceId,
      sessionId: oldCookies.sessionId ?? options?.sessionId,
      optOut: options?.optOut ?? oldCookies.optOut,
      lastEventTime: oldCookies.lastEventTime,
    });
    await super._init(reactNativeOptions);

    // Step 3: Manage session
    let isNewSession = !this.config.lastEventTime;
    if (
      !this.config.sessionId ||
      (this.config.lastEventTime && Date.now() - this.config.lastEventTime > this.config.sessionTimeout)
    ) {
      // Either
      // 1) No previous session; or
      // 2) Previous session expired
      this.setSessionId(Date.now());
      isNewSession = true;
    }

    // Set up the analytics connector to integrate with the experiment SDK.
    // Send events from the experiment SDK and forward identifies to the
    // identity store.
    const connector = getAnalyticsConnector();
    connector.eventBridge.setEventReceiver((event) => {
      void this.track(event.eventType, event.eventProperties);
    });
    connector.identityStore.setIdentity({
      userId: this.config.userId,
      deviceId: this.config.deviceId,
    });

    // Step 4: Install plugins
    // Do not track any events before this
    await this.add(new Context());
    await this.add(new IdentityEventSender());
    await this.add(new Destination());

    this.initializing = false;

    // Step 5: Set timeline ready for processing events
    // Send existing events, which might be collected by track before init
    this.timeline.isReady = true;
    if (!this.config.optOut) {
      this.timeline.scheduleApply(0);
    }

    // Step 6: Track attributions
    await this.runAttributionStrategy(options?.attribution, isNewSession);
  }

  async runAttributionStrategy(attributionConfig?: AttributionOptions, isNewSession = false) {
    if (isNative()) {
      return;
    }
    const track = this.track.bind(this);
    const onNewCampaign = this.setSessionId.bind(this, Date.now());

    const storage = await createFlexibleStorage<Campaign>(this.config);
    const campaignTracker = new CampaignTracker(this.config.apiKey, {
      ...attributionConfig,
      storage,
      track,
      onNewCampaign,
    });

    await campaignTracker.send(isNewSession);
  }

  getUserId() {
    return this.config?.userId;
  }

  setUserId(userId: string | undefined) {
    if (!this.config) {
      this.q.push(this.setUserId.bind(this, userId));
      return;
    }
    this.config.userId = userId;
    getAnalyticsConnector()
      .identityStore.editIdentity()
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .setUserId(userId)
      .commit();
  }

  getDeviceId() {
    return this.config?.deviceId;
  }

  setDeviceId(deviceId: string) {
    if (!this.config) {
      this.q.push(this.setDeviceId.bind(this, deviceId));
      return;
    }
    this.config.deviceId = deviceId;
    getAnalyticsConnector()
      .identityStore.editIdentity()
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .setDeviceId(deviceId)
      .commit();
  }

  reset() {
    this.setUserId(undefined);
    this.setDeviceId(UUID());
  }

  getSessionId() {
    return this.config?.sessionId;
  }

  setSessionId(sessionId: number) {
    if (!this.config) {
      this.q.push(this.setSessionId.bind(this, sessionId));
      return;
    }
    this.config.sessionId = sessionId;
  }
}

export const createInstance = (): ReactNativeClient => {
  const client = new AmplitudeReactNative();
  return {
    init: returnWrapper(client.init.bind(client)),
    add: returnWrapper(client.add.bind(client)),
    remove: returnWrapper(client.remove.bind(client)),
    track: returnWrapper(client.track.bind(client)),
    logEvent: returnWrapper(client.logEvent.bind(client)),
    identify: returnWrapper(client.identify.bind(client)),
    groupIdentify: returnWrapper(client.groupIdentify.bind(client)),
    setGroup: returnWrapper(client.setGroup.bind(client)),
    revenue: returnWrapper(client.revenue.bind(client)),
    flush: returnWrapper(client.flush.bind(client)),
    getUserId: client.getUserId.bind(client),
    setUserId: client.setUserId.bind(client),
    getDeviceId: client.getDeviceId.bind(client),
    setDeviceId: client.setDeviceId.bind(client),
    reset: client.reset.bind(client),
    getSessionId: client.getSessionId.bind(client),
    setSessionId: client.setSessionId.bind(client),
    setOptOut: client.setOptOut.bind(client),
  };
};

export default createInstance();
