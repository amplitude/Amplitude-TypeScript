import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import {
  AmplitudeCore,
  Destination,
  UUID,
  returnWrapper,
  debugWrapper,
  getClientLogConfig,
  getClientStates,
  ReactNativeConfig,
  ReactNativeOptions,
  ReactNativeAttributionOptions as AttributionOptions,
  IIdentify,
  EventOptions,
  Event,
  Result,
  ReactNativeClient,
  Campaign,
  IdentityEventSender,
  getAnalyticsConnector,
  setConnectorDeviceId,
  setConnectorUserId,
  SpecialEventType,
  AnalyticsClient,
  OfflineDisabled,
  ReactNativeAutocaptureOptions,
  ReactNativeConfigAutocaptureBeta,
  NavigationState,
  NetworkTrackingOptions,
  normalizeNetworkCaptureRules,
} from '@amplitude/analytics-core';
import { plugin as networkCapturePlugin } from '@amplitude/plugin-network-capture-browser';
import { CampaignTracker } from './campaign/campaign-tracker';
import { Context } from './plugins/context';
import { networkConnectivityCheckerPlugin } from './plugins/network-connectivity-checker';
import { useReactNativeConfig, createCookieStorage } from './config';
import { parseOldCookies } from './cookie-migration';
import { isNative } from './utils/platform';
import {
  DEFAULT_APPLICATION_BACKGROUNDED_EVENT,
  DEFAULT_APPLICATION_OPENED_EVENT,
  DEFAULT_SCREEN_VIEWED_EVENT,
  DEFAULT_SESSION_END_EVENT,
  DEFAULT_SESSION_START_EVENT,
  SCREEN_NAME,
} from './constants';

/**
 * Walks React Navigation state to the focused leaf route.
 * Nested navigators (tabs, stacks) store the visible screen in child `state`.
 */
const getActiveRouteName = (navigationState: NavigationState): string | undefined => {
  let state: NavigationState | undefined = navigationState;
  let routeName: string | undefined;

  while (state?.routes) {
    const route = state.routes[state.index] as { name: string; state?: NavigationState } | undefined;
    if (!route?.name) {
      return undefined;
    }
    routeName = route.name;
    state = route.state;
  }

  return routeName;
};

const getNetworkTrackingConfig = (config: ReactNativeConfigAutocaptureBeta): NetworkTrackingOptions | undefined => {
  let networkTrackingConfig;
  if (typeof config.autocapture === 'object' && typeof config.autocapture.networkTracking === 'object') {
    networkTrackingConfig = config.autocapture.networkTracking;
  }
  return {
    ...networkTrackingConfig,
    captureRules: normalizeNetworkCaptureRules(networkTrackingConfig?.captureRules, config.loggerProvider),
  };
};

export class AmplitudeReactNative extends AmplitudeCore implements ReactNativeClient, AnalyticsClient {
  appState: AppStateStatus = 'background';
  /**
   * True after a transition into `background` until the next `active`.
   * Used so Application Opened only pairs with Application Backgrounded
   * (e.g. skip iOS inactive→active from Control Center overlays).
   */
  private wasBackgrounded = false;
  /**
   * Last focused leaf route name emitted by `trackNavigationStateChange`.
   * Dedupes React Navigation `onStateChange` callbacks that only change params,
   * history shape, or fire twice for the same visible screen (common with tabs).
   */
  private lastNavigationScreenName: string | undefined;
  private appStateChangeHandler: NativeEventSubscription | undefined;
  explicitSessionId: number | undefined;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: ReactNativeConfig;
  userProperties: { [key: string]: any } | undefined;
  autocapture: ReactNativeAutocaptureOptions | null = null;

  init(apiKey = '', userId?: string, options?: ReactNativeOptions) {
    return returnWrapper(this._init({ ...options, userId, apiKey }));
  }
  protected async _init(options: ReactNativeOptions & { apiKey: string }) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;
    this.explicitSessionId = options.sessionId;

    // Step 1: Read cookies stored by old SDK
    const oldCookies = await parseOldCookies(options.apiKey, options);

    // Step 2: Create react native config
    const reactNativeOptions = await useReactNativeConfig(options.apiKey, {
      ...options,
      deviceId: options.deviceId ?? oldCookies.deviceId,
      sessionId: oldCookies.sessionId,
      optOut: options.optOut ?? oldCookies.optOut,
      lastEventTime: oldCookies.lastEventTime,
      userId: options.userId ?? oldCookies.userId,
    });
    await super._init(reactNativeOptions);

    // Step 2.1: parse autocapture config (always reset so re-init clears prior flags)
    const autocaptureConfig = (this.config as ReactNativeConfigAutocaptureBeta).autocapture;
    if (autocaptureConfig === true) {
      this.autocapture = {
        appLifecycles: true,
        sessions: true,
      };
    } else if (autocaptureConfig && typeof autocaptureConfig === 'object') {
      this.autocapture = autocaptureConfig;
    } else {
      this.autocapture = null;
    }
    // Drop any background seen before this init so Opened cannot fire unpaired.
    this.wasBackgrounded = false;
    // Allow the first navigation screen view after re-init.
    this.lastNavigationScreenName = undefined;

    // Set up the analytics connector to integrate with the experiment SDK.
    // Send events from the experiment SDK and forward identifies to the
    // identity store.
    const connector = getAnalyticsConnector();
    connector.identityStore.setIdentity({
      userId: this.config.userId,
      deviceId: this.config.deviceId,
    });

    // Step 3: Install plugins
    // Do not track any events before this
    // Install before Destination so `config.offline` is set before any flush.
    // Skip when offline mode is disabled via the OfflineDisabled sentinel.
    if (this.config.offline !== OfflineDisabled) {
      await this.add(networkConnectivityCheckerPlugin()).promise;
    }
    await this.add(new Destination()).promise;
    await this.add(new Context()).promise;
    await this.add(new IdentityEventSender()).promise;

    if (this.autocapture?.networkTracking) {
      this.config.loggerProvider.debug('Adding network tracking plugin');
      await this.add(networkCapturePlugin(getNetworkTrackingConfig(this.config))).promise;
    }

    // Step 4: Manage session
    this.appState = AppState.currentState;
    const isNewSession = this.startNewSessionIfNeeded(this.currentTimeMillis());
    this.config.loggerProvider?.log(
      `Init: startNewSessionIfNeeded = ${isNewSession ? 'yes' : 'no'}, sessionId = ${
        this.getSessionId() ?? 'undefined'
      }`,
    );
    this.appStateChangeHandler = AppState.addEventListener('change', this.handleAppStateChange);

    this.initializing = false;

    // Step 5: autocapture

    // Step 5.1: run attribution strategy
    await this.runAttributionStrategy(options.attribution, isNewSession);

    // Step 6: Run queued functions
    await this.runQueuedFunctions('dispatchQ');

    // Step 7: Add the event receiver after running remaining queued functions.
    connector.eventBridge.setEventReceiver((event) => {
      void this.track(event.eventType, event.eventProperties);
    });
  }

  shutdown() {
    this.appStateChangeHandler?.remove();
  }

  async runAttributionStrategy(attributionConfig?: AttributionOptions, isNewSession = false) {
    if (isNative()) {
      return;
    }
    const track = (...args: Parameters<typeof this.track>) => this.track(...args).promise;
    const onNewCampaign = this.setSessionId.bind(this, this.currentTimeMillis());

    const storage = await createCookieStorage<Campaign>(this.config);
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
    setConnectorUserId(userId);
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
    setConnectorDeviceId(deviceId);
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

  getIdentity() {
    return {
      userId: this.getUserId(),
      deviceId: this.getDeviceId(),
      userProperties: this.userProperties,
    };
  }

  getOptOut() {
    return this.config?.optOut;
  }

  setSessionId(sessionId: number) {
    if (!this.config) {
      this.q.push(this.setSessionId.bind(this, sessionId));
      return;
    }

    this.explicitSessionId = sessionId;
    void this.setSessionIdInternal(sessionId, this.currentTimeMillis());
  }

  extendSession() {
    if (!this.config) {
      this.q.push(this.extendSession.bind(this));
      return;
    }
    this.config.lastEventTime = this.currentTimeMillis();
  }

  trackScreenView(screenName: string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    return this.track(
      DEFAULT_SCREEN_VIEWED_EVENT,
      {
        [SCREEN_NAME]: screenName,
        ...eventProperties,
      },
      eventOptions,
    );
  }

  trackNavigationStateChange(
    navigationState: NavigationState | undefined,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ) {
    if (!navigationState) {
      return;
    }
    const screenName = getActiveRouteName(navigationState);
    if (!screenName || screenName === this.lastNavigationScreenName) {
      return;
    }
    this.lastNavigationScreenName = screenName;
    return this.trackScreenView(screenName, eventProperties, eventOptions);
  }

  private setSessionIdInternal(sessionId: number, eventTime: number) {
    const previousSessionId = this.config.sessionId;
    if (previousSessionId === sessionId) {
      return;
    }

    this.config.sessionId = sessionId;

    if (this.config.trackingSessionEvents || this.autocapture?.sessions) {
      this.config.loggerProvider?.log(`SESSION_END event: previousSessionId = ${previousSessionId ?? 'undefined'}`);

      if (previousSessionId !== undefined) {
        const sessionEndEvent: Event = {
          event_type: DEFAULT_SESSION_END_EVENT,
          time: this.config.lastEventTime !== undefined ? this.config.lastEventTime + 1 : sessionId, // increment lastEventTime to sort events properly in UI - session_end should be the last event in a session
          session_id: previousSessionId,
        };
        void this.track(sessionEndEvent);
      }

      this.config.loggerProvider?.log(`SESSION_START event: sessionId = ${sessionId}`);
      const sessionStartEvent: Event = {
        event_type: DEFAULT_SESSION_START_EVENT,
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

      const isSessionEvent =
        event.event_type === DEFAULT_SESSION_START_EVENT || event.event_type === DEFAULT_SESSION_END_EVENT;
      const isCustomEventSessionId =
        !isSessionEvent && event.session_id != undefined && event.session_id !== this.getSessionId();
      if (!isCustomEventSessionId) {
        if (!isSessionEvent) {
          if (this.appState !== 'active') {
            this.startNewSessionIfNeeded(eventTime);
          }
        }
        this.config.lastEventTime = eventTime;
      }

      if (event.session_id == undefined) {
        event.session_id = this.getSessionId();
      }

      if (event.event_id === undefined) {
        const eventId = (this.config.lastEventId ?? 0) + 1;
        event = { ...event, event_id: eventId };
        this.config.lastEventId = eventId;
      }
    }

    // Set user properties
    if (event.event_type === SpecialEventType.IDENTIFY && event.user_properties) {
      this.userProperties = this.getOperationAppliedUserProperties(event.user_properties);
    }

    return super.process(event);
  }

  currentTimeMillis() {
    return Date.now();
  }

  private startNewSessionIfNeeded(timestamp: number): boolean {
    const sessionId = this.explicitSessionId ?? timestamp;

    const shouldStartNewSession = this.shouldStartNewSession(timestamp);
    if (shouldStartNewSession) {
      this.setSessionIdInternal(sessionId, timestamp);
    } else {
      this.config.lastEventTime = timestamp;
    }

    return shouldStartNewSession;
  }

  private shouldStartNewSession(timestamp: number): boolean {
    const sessionId = this.explicitSessionId ?? timestamp;

    return (
      !this.inSession() ||
      (this.explicitSessionId !== this.config.sessionId &&
        (this.explicitSessionId !== undefined || !this.isWithinMinTimeBetweenSessions(sessionId)))
    );
  }

  private isWithinMinTimeBetweenSessions(timestamp: number) {
    return timestamp - (this.config.lastEventTime ?? 0) < this.config.sessionTimeout;
  }

  private inSession() {
    return this.config.sessionId != undefined;
  }

  private readonly handleAppStateChange = (nextAppState: AppStateStatus) => {
    const currentAppState = this.appState;
    this.appState = nextAppState;
    if (currentAppState !== nextAppState) {
      const timestamp = this.currentTimeMillis();
      if (nextAppState == 'active') {
        this.enterForeground(timestamp);
      } else {
        this.exitForeground(timestamp);
      }
      if (nextAppState == 'background' && this.autocapture?.appLifecycles === true) {
        // Only remember background when we also emit Backgrounded, so Opened stays paired.
        this.wasBackgrounded = true;
        this.track(DEFAULT_APPLICATION_BACKGROUNDED_EVENT);
      }
    }
  };

  private enterForeground(timestamp: number) {
    this.config.loggerProvider?.log('App Activated');
    // Only emit Application Opened after a real background (not inactive→active).
    if (this.autocapture?.appLifecycles === true && this.wasBackgrounded) {
      this.track(DEFAULT_APPLICATION_OPENED_EVENT);
    }
    this.wasBackgrounded = false;
    return this.startNewSessionIfNeeded(timestamp);
  }

  private exitForeground(timestamp: number) {
    this.config.lastEventTime = timestamp;
  }
}

export const createInstance = (): ReactNativeClient => {
  const client = new AmplitudeReactNative();
  return {
    ...client,
    trackScreenView: debugWrapper(
      client.trackScreenView.bind(client),
      'trackScreenView',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    trackNavigationStateChange: debugWrapper(
      client.trackNavigationStateChange.bind(client),
      'trackNavigationStateChange',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    init: debugWrapper(
      client.init.bind(client),
      'init',
      getClientLogConfig(client),
      getClientStates(client, ['config']),
    ),
    add: debugWrapper(
      client.add.bind(client),
      'add',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    remove: debugWrapper(
      client.remove.bind(client),
      'remove',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.plugins']),
    ),
    track: debugWrapper(
      client.track.bind(client),
      'track',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    logEvent: debugWrapper(
      client.logEvent.bind(client),
      'logEvent',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    identify: debugWrapper(
      client.identify.bind(client),
      'identify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    groupIdentify: debugWrapper(
      client.groupIdentify.bind(client),
      'groupIdentify',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    setGroup: debugWrapper(
      client.setGroup.bind(client),
      'setGroup',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    revenue: debugWrapper(
      client.revenue.bind(client),
      'revenue',
      getClientLogConfig(client),
      getClientStates(client, ['config.apiKey', 'timeline.queue.length']),
    ),
    flush: debugWrapper(
      client.flush.bind(client),
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
    extendSession: debugWrapper(
      client.extendSession.bind(client),
      'extendSession',
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
