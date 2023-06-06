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
} from '@amplitude/analytics-client-common';
import {
  BrowserClient,
  BrowserConfig,
  BrowserOptions,
  EventOptions,
  Identify as IIdentify,
  Revenue as IRevenue,
  TransportType,
} from '@amplitude/analytics-types';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { useBrowserConfig, createTransport } from './config';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { sessionHandlerPlugin } from './plugins/session-handler';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from './constants';

export class AmplitudeBrowser extends AmplitudeCore implements BrowserClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  previousSessionDeviceId: string | undefined;
  previousSessionUserId: string | undefined;

  init(apiKey = '', userId?: string, options?: BrowserOptions) {
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

    // Step 3: Manage session
    if (
      !this.config.sessionId ||
      (this.config.lastEventTime && Date.now() - this.config.lastEventTime > this.config.sessionTimeout)
    ) {
      // Either
      // 1) No previous session; or
      // 2) Previous session expired
      this.setSessionId(Date.now());
    }

    // Set up the analytics connector to integrate with the experiment SDK.
    // Send events from the experiment SDK and forward identifies to the
    // identity store.
    const connector = getAnalyticsConnector();
    connector.identityStore.setIdentity({
      userId: this.config.userId,
      deviceId: this.config.deviceId,
    });

    // Step 4: Install plugins
    // Do not track any events before this
    await this.add(new Destination()).promise;
    await this.add(new Context()).promise;
    await this.add(sessionHandlerPlugin()).promise;
    await this.add(new IdentityEventSender()).promise;

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
    await this.add(pageViewTrackingPlugin(getPageViewTrackingConfig(this.config))).promise;

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
      setConnectorUserId(userId);
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
    setConnectorDeviceId(deviceId);
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
    const previousSessionId = this.getSessionId();
    const previousLastEventTime = this.config.lastEventTime;

    this.config.sessionId = sessionId;
    this.config.lastEventTime = undefined;

    if (isSessionTrackingEnabled(this.config.defaultTracking)) {
      if (previousSessionId && previousLastEventTime) {
        const eventOptions: EventOptions = {
          session_id: previousSessionId,
          time: previousLastEventTime + 1,
        };
        eventOptions.device_id = this.previousSessionDeviceId;
        eventOptions.user_id = this.previousSessionUserId;
        this.track(DEFAULT_SESSION_END_EVENT, undefined, eventOptions);
      }

      this.track(DEFAULT_SESSION_START_EVENT, undefined, {
        session_id: sessionId,
        time: sessionId - 1,
      });
      this.previousSessionDeviceId = this.config.deviceId;
      this.previousSessionUserId = this.config.userId;
    }
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
}
