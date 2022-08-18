import { AmplitudeCore, Destination, Identify, Revenue, UUID, returnWrapper } from '@amplitude/analytics-core';
import {
  AdditionalBrowserOptions,
  AttributionBrowserOptions,
  BrowserClient,
  BrowserConfig,
  BrowserOptions,
  Campaign,
  EventOptions,
  Identify as IIdentify,
  Result,
  Revenue as IRevenue,
  TransportType,
} from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { useBrowserConfig, createTransport, createFlexibleStorage } from './config';
import { parseOldCookies } from './cookie-migration';
import { CampaignTracker } from './attribution/campaign-tracker';
import { getAnalyticsConnector } from './utils/analytics-connector';
import { IdentityEventSender } from './plugins/identity';

export class AmplitudeBrowser extends AmplitudeCore<BrowserConfig> {
  async init(apiKey: string, userId?: string, options?: BrowserOptions & AdditionalBrowserOptions) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    // Step 1: Read cookies stored by old SDK
    const oldCookies = await parseOldCookies(apiKey, options);

    // Step 2: Create browser config
    const browserOptions = await useBrowserConfig(apiKey, userId || oldCookies.userId, {
      ...options,
      deviceId: oldCookies.deviceId ?? options?.deviceId,
      sessionId: oldCookies.sessionId ?? options?.sessionId,
      optOut: options?.optOut ?? oldCookies.optOut,
      lastEventTime: oldCookies.lastEventTime,
    });
    await super._init(browserOptions);

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

  async runAttributionStrategy(attributionConfig?: AttributionBrowserOptions, isNewSession = false) {
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
    this.config.lastEventTime = undefined;
  }

  setTransport(transport: TransportType) {
    if (!this.config) {
      this.q.push(this.setTransport.bind(this, transport));
      return;
    }
    this.config.transportProvider = createTransport(transport);
  }

  identify(identify: IIdentify, eventOptions?: EventOptions): Promise<Result> {
    if (isInstanceProxy(identify)) {
      const queue = identify._q;
      identify._q = [];
      identify = convertProxyObjectToRealObject(new Identify(), queue);
    }
    return super.identify(identify, eventOptions);
  }

  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: IIdentify,
    eventOptions?: EventOptions,
  ): Promise<Result> {
    if (isInstanceProxy(identify)) {
      const queue = identify._q;
      identify._q = [];
      identify = convertProxyObjectToRealObject(new Identify(), queue);
    }
    return super.groupIdentify(groupType, groupName, identify, eventOptions);
  }

  revenue(revenue: IRevenue, eventOptions?: EventOptions) {
    if (isInstanceProxy(revenue)) {
      const queue = revenue._q;
      revenue._q = [];
      revenue = convertProxyObjectToRealObject(new Revenue(), queue);
    }
    return super.revenue(revenue, eventOptions);
  }
}

export const createInstance = (): BrowserClient => {
  const client = new AmplitudeBrowser();
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
    setTransport: client.setTransport.bind(client),
  };
};

export default createInstance();
