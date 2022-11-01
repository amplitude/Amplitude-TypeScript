import { AppState, AppStateStatus } from 'react-native';
import {
  AmplitudeCore,
  Destination,
  UUID,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
} from '@amplitude/analytics-core';
import { CampaignTracker, IdentityEventSender, getAnalyticsConnector } from '@amplitude/analytics-client-common';
import {
  ReactNativeConfig,
  Campaign,
  ReactNativeOptions,
  AttributionOptions,
  ReactNativeClient,
  Identify as IIdentify,
  EventOptions,
  Event,
  Result,
} from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useReactNativeConfig, createFlexibleStorage } from './config';
import { parseOldCookies } from './cookie-migration';
import { isNative } from './utils/platform';

const START_SESSION_EVENT = 'session_start';
const END_SESSION_EVENT = 'session_end';

export class AmplitudeReactNative extends AmplitudeCore<ReactNativeConfig> {
  appState: AppStateStatus = 'background';
  explicitSessionId: number | undefined;

  async init(apiKey = '', userId?: string, options?: ReactNativeOptions) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;
    this.explicitSessionId = options?.sessionId;

    // Step 1: Read cookies stored by old SDK
    const oldCookies = await parseOldCookies(apiKey, options);

    // Step 2: Create react native config
    const reactNativeOptions = await useReactNativeConfig(apiKey, userId || oldCookies.userId, {
      ...options,
      deviceId: oldCookies.deviceId ?? options?.deviceId,
      sessionId: oldCookies.sessionId,
      optOut: options?.optOut ?? oldCookies.optOut,
      lastEventTime: oldCookies.lastEventTime,
    });
    await super._init(reactNativeOptions);

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

    // Step 3: Install plugins
    // Do not track any events before this
    await this.add(new Context());
    await this.add(new IdentityEventSender());
    await this.add(new Destination());

    // Step 4: Manage session
    this.appState = AppState.currentState;
    const isNewSession = this.startNewSessionIfNeeded();
    AppState.addEventListener('change', this.handleAppStateChange);

    this.initializing = false;

    // Step 5: Track attributions
    await this.runAttributionStrategy(options?.attribution, isNewSession);

    // Step 6: Run queued functions
    await this.runQueuedFunctions('dispatchQ');
  }

  shutdown() {
    AppState.removeEventListener('change', this.handleAppStateChange);
  }

  async runAttributionStrategy(attributionConfig?: AttributionOptions, isNewSession = false) {
    if (isNative()) {
      return;
    }
    const track = this.track.bind(this);
    const onNewCampaign = this.setSessionId.bind(this, this.currentTimeMillis());

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

  identify(identify: IIdentify, eventOptions?: EventOptions) {
    if (eventOptions?.user_id) {
      this.setUserId(eventOptions.user_id);
    }
    if (eventOptions?.device_id) {
      this.setDeviceId(eventOptions.device_id);
    }
    return super.identify(identify, eventOptions);
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

    this.explicitSessionId = sessionId;
    void this.setSessionIdInternal(sessionId, this.currentTimeMillis());
  }

  private setSessionIdInternal(sessionId: number, eventTime: number) {
    const previousSessionId = this.config.sessionId;
    if (previousSessionId === sessionId) {
      return;
    }

    this.config.sessionId = sessionId;

    if (this.config.trackingOptions.sessionEvents) {
      if (previousSessionId !== undefined) {
        const sessionEndEvent: Event = {
          event_type: END_SESSION_EVENT,
          time: this.config.lastEventTime !== undefined ? this.config.lastEventTime + 1 : sessionId, // increment lastEventTime to sort events properly in UI - session_end should be the last event in a session
          session_id: previousSessionId,
        };
        void this.track(sessionEndEvent);
      }

      const sessionStartEvent: Event = {
        event_type: START_SESSION_EVENT,
        time: eventTime,
        session_id: sessionId,
      };
      void this.track(sessionStartEvent);
    }

    this.config.lastEventTime = eventTime;
  }

  async process(event: Event): Promise<Result> {
    if (!this.config.optOut) {
      const eventTime = event.time ?? this.currentTimeMillis();
      if (event.time === undefined) {
        event = { ...event, time: eventTime };
      }

      if (event.event_type != START_SESSION_EVENT && event.event_type != END_SESSION_EVENT) {
        if (this.appState !== 'active') {
          this.startNewSessionIfNeeded(eventTime);
        }
      }
      this.config.lastEventTime = eventTime;

      if (event.session_id == undefined) {
        event.session_id = this.getSessionId();
      }
    }

    return super.process(event);
  }

  currentTimeMillis() {
    return Date.now();
  }

  private startNewSessionIfNeeded(eventTime?: number): boolean {
    eventTime = eventTime ?? this.currentTimeMillis();
    const sessionId = this.explicitSessionId ?? eventTime;

    if (
      this.inSession() &&
      (this.explicitSessionId === this.config.sessionId ||
        (this.explicitSessionId === undefined && this.isWithinMinTimeBetweenSessions(sessionId)))
    ) {
      this.config.lastEventTime = eventTime;
      return false;
    }

    this.setSessionIdInternal(sessionId, eventTime);
    return true;
  }

  private isWithinMinTimeBetweenSessions(eventTime: number) {
    return eventTime - (this.config.lastEventTime ?? 0) < this.config.sessionTimeout;
  }

  private inSession() {
    return this.config.sessionId != undefined;
  }

  private readonly handleAppStateChange = (nextAppState: AppStateStatus) => {
    const currentAppState = this.appState;
    this.appState = nextAppState;
    if (currentAppState !== nextAppState && nextAppState === 'active') {
      this.startNewSessionIfNeeded();
    }
  };
}

export const createInstance = (): ReactNativeClient => {
  const client = new AmplitudeReactNative();
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
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    remove: debugWrapper(
      returnWrapper(client.remove.bind(client)),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    track: debugWrapper(
      returnWrapper(client.track.bind(client)),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      returnWrapper(client.logEvent.bind(client)),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    identify: debugWrapper(
      returnWrapper(client.identify.bind(client)),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      returnWrapper(client.groupIdentify.bind(client)),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      returnWrapper(client.setGroup.bind(client)),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    revenue: debugWrapper(
      returnWrapper(client.revenue.bind(client)),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    flush: debugWrapper(
      returnWrapper(client.flush.bind(client)),
      'flush',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
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
  };
};

export default createInstance();
