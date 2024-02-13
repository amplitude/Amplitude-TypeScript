import { AmplitudeCore, Destination, Identify, returnWrapper, Revenue, UUID } from '@amplitude/analytics-core';
import {
  getAnalyticsConnector,
  getAttributionTrackingConfig,
  getPageViewTrackingConfig,
  IdentityEventSender,
  isAttributionTrackingEnabled,
  isSessionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  setConnectorDeviceId,
  setConnectorUserId,
  isNewSession,
  isPageViewTrackingEnabled,
} from '@amplitude/analytics-client-common';
import {
  BrowserClient,
  BrowserConfig,
  BrowserOptions,
  Event,
  EventOptions,
  Identify as IIdentify,
  Revenue as IRevenue,
  TransportType,
  OfflineDisabled,
} from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { useBrowserConfig, createTransport } from './config';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from './constants';
import { detNotify } from './det-notification';
import { networkConnectivityCheckerPlugin } from './plugins/network-connectivity-checker';

export class AmplitudeBrowser extends AmplitudeCore implements BrowserClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  previousSessionDeviceId: string | undefined;
  previousSessionUserId: string | undefined;

  init(apiKey = '', userIdOrOptions?: string | BrowserOptions, maybeOptions?: BrowserOptions) {
    let userId: string | undefined;
    let options: BrowserOptions | undefined;

    if (arguments.length > 2) {
      userId = userIdOrOptions as string | undefined;
      options = maybeOptions;
    } else {
      if (typeof userIdOrOptions === 'string') {
        userId = userIdOrOptions;
        options = undefined;
      } else {
        userId = userIdOrOptions?.userId;
        options = userIdOrOptions;
      }
    }
    return returnWrapper(this._init({ ...options, userId, apiKey }));
  }
  protected async _init(options: BrowserOptions & { apiKey: string }) {
    // Step 1: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    // Step 2: Create browser config
    const browserOptions = await useBrowserConfig(options.apiKey, options, this);
    await super._init(browserOptions);

    // Step 3: Set session ID
    // Priority 1: `options.sessionId`
    // Priority 2: last known sessionId from user identity storage
    // Default: `Date.now()`
    // Session ID is handled differently than device ID and user ID due to session events
    this.setSessionId(options.sessionId ?? this.config.sessionId ?? Date.now());

    // Set up the analytics connector to integrate with the experiment SDK.
    // Send events from the experiment SDK and forward identifies to the
    // identity store.
    const connector = getAnalyticsConnector(options.instanceName);
    connector.identityStore.setIdentity({
      userId: this.config.userId,
      deviceId: this.config.deviceId,
    });

    // Step 4: Install plugins
    // Do not track any events before this
    if (this.config.offline !== OfflineDisabled) {
      await this.add(networkConnectivityCheckerPlugin()).promise;
    }
    await this.add(new Destination()).promise;
    await this.add(new Context()).promise;
    await this.add(new IdentityEventSender()).promise;

    // Notify if DET is enabled
    detNotify(this.config);

    if (isFileDownloadTrackingEnabled(this.config.defaultTracking)) {
      await this.add(fileDownloadTracking()).promise;
    }

    if (isFormInteractionTrackingEnabled(this.config.defaultTracking)) {
      await this.add(formInteractionTracking()).promise;
    }

    // Add web attribution plugin
    if (isAttributionTrackingEnabled(this.config.defaultTracking)) {
      const attributionTrackingOptions = getAttributionTrackingConfig(this.config);
      const webAttribution = webAttributionPlugin(attributionTrackingOptions);
      await this.add(webAttribution).promise;
    }

    // Add page view plugin
    if (isPageViewTrackingEnabled(this.config.defaultTracking)) {
      await this.add(pageViewTrackingPlugin(getPageViewTrackingConfig(this.config))).promise;
    }

    this.initializing = false;

    // Step 6: Run queued dispatch functions
    await this.runQueuedFunctions('dispatchQ');

    // Step 7: Add the event receiver after running remaining queued functions.
    connector.eventBridge.setEventReceiver((event) => {
      void this.track(event.eventType, event.eventProperties);
    });
  }

  getUserId() {
    return this.config?.userId;
  }

  setUserId(userId: string | undefined) {
    if (!this.config) {
      this.q.push(this.setUserId.bind(this, userId));
      return;
    }
    if (userId !== this.config.userId || userId === undefined) {
      this.config.userId = userId;
      setConnectorUserId(userId, this.config.instanceName);
    }
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
    setConnectorDeviceId(deviceId, this.config.instanceName);
  }

  reset() {
    this.setDeviceId(UUID());
    this.setUserId(undefined);
  }

  getSessionId() {
    return this.config?.sessionId;
  }

  setSessionId(sessionId: number) {
    if (!this.config) {
      this.q.push(this.setSessionId.bind(this, sessionId));
      return;
    }

    // Prevents starting a new session with the same session ID
    if (sessionId === this.config.sessionId) {
      return;
    }

    const previousSessionId = this.getSessionId();
    const lastEventTime = this.config.lastEventTime;
    let lastEventId = this.config.lastEventId ?? -1;

    this.config.sessionId = sessionId;
    this.config.lastEventTime = undefined;

    if (isSessionTrackingEnabled(this.config.defaultTracking)) {
      if (previousSessionId && lastEventTime) {
        this.track(DEFAULT_SESSION_END_EVENT, undefined, {
          device_id: this.previousSessionDeviceId,
          event_id: ++lastEventId,
          session_id: previousSessionId,
          time: lastEventTime + 1,
          user_id: this.previousSessionUserId,
        });
      }

      this.config.lastEventTime = this.config.sessionId;
      this.track(DEFAULT_SESSION_START_EVENT, undefined, {
        event_id: ++lastEventId,
        session_id: this.config.sessionId,
        time: this.config.lastEventTime,
      });
    }

    this.previousSessionDeviceId = this.config.deviceId;
    this.previousSessionUserId = this.config.userId;
  }

  extendSession() {
    if (!this.config) {
      this.q.push(this.extendSession.bind(this));
      return;
    }
    this.config.lastEventTime = Date.now();
  }

  setTransport(transport: TransportType) {
    if (!this.config) {
      this.q.push(this.setTransport.bind(this, transport));
      return;
    }
    this.config.transportProvider = createTransport(transport);
  }

  identify(identify: IIdentify, eventOptions?: EventOptions) {
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

  groupIdentify(groupType: string, groupName: string | string[], identify: IIdentify, eventOptions?: EventOptions) {
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

  async process(event: Event) {
    const currentTime = Date.now();
    const isEventInNewSession = isNewSession(this.config.sessionTimeout, this.config.lastEventTime);

    if (
      event.event_type !== DEFAULT_SESSION_START_EVENT &&
      event.event_type !== DEFAULT_SESSION_END_EVENT &&
      (!event.session_id || event.session_id === this.getSessionId()) &&
      isEventInNewSession
    ) {
      this.setSessionId(currentTime);
    }

    return super.process(event);
  }
}
