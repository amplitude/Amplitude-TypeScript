import {
  AmplitudeCore,
  Destination,
  Identify,
  Revenue,
  UUID,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
} from '@amplitude/analytics-core';
import { CampaignTracker, getAnalyticsConnector, IdentityEventSender } from '@amplitude/analytics-client-common';
import {
  AttributionOptions,
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

export class AmplitudeBrowser extends AmplitudeCore<BrowserConfig> {
  async init(apiKey = '', userId?: string, options?: BrowserOptions) {
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

    // Step 5: Track attributions
    await this.runAttributionStrategy(browserOptions.attribution, isNewSession);

    // Step 6: Run queued dispatch functions
    await this.runQueuedFunctions('dispatchQ');
  }

  async runAttributionStrategy(attributionConfig?: AttributionOptions, isNewSession = false) {
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
    if (eventOptions?.user_id) {
      this.setUserId(eventOptions.user_id);
    }
    if (eventOptions?.device_id) {
      this.setDeviceId(eventOptions.device_id);
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
    init: debugWrapper(
      returnWrapper(client.init.bind(client)),
      'init',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    add: debugWrapper(
      returnWrapper(client.add.bind(client)),
      'add',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.plugins']),
    ),
    remove: debugWrapper(
      returnWrapper(client.remove.bind(client)),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.plugins']),
    ),
    track: debugWrapper(
      returnWrapper(client.track.bind(client)),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      returnWrapper(client.logEvent.bind(client)),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    identify: debugWrapper(
      returnWrapper(client.identify.bind(client)),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      returnWrapper(client.groupIdentify.bind(client)),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      returnWrapper(client.setGroup.bind(client)),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    revenue: debugWrapper(
      returnWrapper(client.revenue.bind(client)),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    flush: debugWrapper(
      returnWrapper(client.flush.bind(client)),
      'flush',
      getClientLogConfig(client),
      getClientStates(client, ['timeline.queue.length']),
    ),
    getUserId: debugWrapper(
      client.getUserId.bind(client),
      'getUserId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId']),
    ),
    setUserId: debugWrapper(
      client.setUserId.bind(client),
      'setUserId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId']),
    ),
    getDeviceId: debugWrapper(
      client.getDeviceId.bind(client),
      'getDeviceId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.deviceId']),
    ),
    setDeviceId: debugWrapper(
      client.setDeviceId.bind(client),
      'setDeviceId',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.deviceId']),
    ),
    reset: debugWrapper(
      client.reset.bind(client),
      'reset',
      getClientLogConfig(client),
      getClientStates(client, ['config', 'config.userId', 'config.deviceId']),
    ),
    getSessionId: debugWrapper(
      client.getSessionId.bind(client),
      'getSessionId',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setSessionId: debugWrapper(
      client.setSessionId.bind(client),
      'setSessionId',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setOptOut: debugWrapper(
      client.setOptOut.bind(client),
      'setOptOut',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    setTransport: debugWrapper(
      client.setTransport.bind(client),
      'setTransport',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
  };
};

export default createInstance();
