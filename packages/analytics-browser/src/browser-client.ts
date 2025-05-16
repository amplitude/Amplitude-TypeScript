import {
  AmplitudeCore,
  Destination,
  Identify,
  returnWrapper,
  Revenue,
  UUID,
  getAnalyticsConnector,
  setConnectorDeviceId,
  setConnectorUserId,
  isNewSession,
  IdentityEventSender,
  getQueryParams,
  Event,
  EventOptions,
  IIdentify,
  IRevenue,
  TransportType,
  OfflineDisabled,
  Result,
  BrowserOptions,
  BrowserConfig,
  BrowserClient,
} from '@amplitude/analytics-core';
import {
  getAttributionTrackingConfig,
  getPageViewTrackingConfig,
  getElementInteractionsConfig,
  getNetworkTrackingConfig,
  isAttributionTrackingEnabled,
  isSessionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isElementInteractionsEnabled,
  isPageViewTrackingEnabled,
  isNetworkTrackingEnabled,
} from './default-tracking';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';
import { Context } from './plugins/context';
import { useBrowserConfig, createTransport } from './config';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from './constants';
import { detNotify } from './det-notification';
import { networkConnectivityCheckerPlugin } from './plugins/network-connectivity-checker';
import { createBrowserJoinedConfigGenerator } from './config/joined-config';
import { autocapturePlugin } from '@amplitude/plugin-autocapture-browser';
import { plugin as networkCapturePlugin } from '@amplitude/plugin-network-capture-browser';
import { WebAttribution } from './attribution/web-attribution';

/**
 * Exported for `@amplitude/unified` or integration with blade plugins.
 * If you only use `@amplitude/analytics-browser`, use `amplitude.init()` or `amplitude.createInstance()` instead.
 */
export class AmplitudeBrowser extends AmplitudeCore implements BrowserClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  previousSessionDeviceId: string | undefined;
  previousSessionUserId: string | undefined;
  webAttribution: WebAttribution | undefined;

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

    let browserOptions = await useBrowserConfig(options.apiKey, options, this);
    // Step 2: Create browser config
    if (browserOptions.fetchRemoteConfig) {
      const joinedConfigGenerator = await createBrowserJoinedConfigGenerator(browserOptions);
      browserOptions = await joinedConfigGenerator.generateJoinedConfig();
    }
    await super._init(browserOptions);
    this.logBrowserOptions(browserOptions);

    // Add web attribution plugin
    if (isAttributionTrackingEnabled(this.config.defaultTracking)) {
      const attributionTrackingOptions = getAttributionTrackingConfig(this.config);
      this.webAttribution = new WebAttribution(attributionTrackingOptions, this.config);
      // Fetch the current campaign, check if need to track web attribution later
      await this.webAttribution.init();
    }

    // Step 3: Set session ID
    // Priority 1: `options.sessionId`
    // Priority 2: sessionId from url if it's Number
    // Priority 3: last known sessionId from user identity storage
    // Default: `Date.now()`
    // Session ID is handled differently than device ID and user ID due to session events
    const queryParams = getQueryParams();
    const querySessionId = Number.isNaN(Number(queryParams.ampSessionId))
      ? undefined
      : Number(queryParams.ampSessionId);
    this.setSessionId(options.sessionId ?? querySessionId ?? this.config.sessionId ?? Date.now());

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
      this.config.loggerProvider.debug('Adding file download tracking plugin');
      await this.add(fileDownloadTracking()).promise;
    }

    if (isFormInteractionTrackingEnabled(this.config.defaultTracking)) {
      this.config.loggerProvider.debug('Adding form interaction plugin');
      await this.add(formInteractionTracking()).promise;
    }

    // Add page view plugin
    if (isPageViewTrackingEnabled(this.config.defaultTracking)) {
      this.config.loggerProvider.debug('Adding page view tracking plugin');
      await this.add(pageViewTrackingPlugin(getPageViewTrackingConfig(this.config))).promise;
    }

    if (isElementInteractionsEnabled(this.config.autocapture)) {
      this.config.loggerProvider.debug('Adding user interactions plugin (autocapture plugin)');
      await this.add(autocapturePlugin(getElementInteractionsConfig(this.config))).promise;
    }

    if (isNetworkTrackingEnabled(this.config.autocapture)) {
      this.config.loggerProvider.debug('Adding network tracking plugin');
      await this.add(networkCapturePlugin(getNetworkTrackingConfig(this.config))).promise;
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
    this.config.loggerProvider.debug('function setUserId: ', userId);
    if (userId !== this.config.userId || userId === undefined) {
      this.config.userId = userId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.timeline.onIdentityChanged({ userId: userId });
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
    this.config.loggerProvider.debug('function setDeviceId: ', deviceId);
    if (deviceId !== this.config.deviceId) {
      this.config.deviceId = deviceId;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.timeline.onIdentityChanged({ deviceId: deviceId });
      setConnectorDeviceId(deviceId, this.config.instanceName);
    }
  }

  reset() {
    this.setDeviceId(UUID());
    this.setUserId(undefined);
  }

  getSessionId() {
    return this.config?.sessionId;
  }

  setSessionId(sessionId: number) {
    const promises: Promise<Result>[] = [];
    if (!this.config) {
      this.q.push(this.setSessionId.bind(this, sessionId));
      return returnWrapper(Promise.resolve());
    }
    // Prevents starting a new session with the same session ID
    if (sessionId === this.config.sessionId) {
      return returnWrapper(Promise.resolve());
    }

    this.config.loggerProvider.debug('function setSessionId: ', sessionId);

    const previousSessionId = this.getSessionId();
    if (previousSessionId !== sessionId) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      this.timeline.onSessionIdChanged(sessionId);
    }

    const lastEventTime = this.config.lastEventTime;
    let lastEventId = this.config.lastEventId ?? -1;

    this.config.sessionId = sessionId;
    this.config.lastEventTime = undefined;
    this.config.pageCounter = 0;

    if (isSessionTrackingEnabled(this.config.defaultTracking)) {
      if (previousSessionId && lastEventTime) {
        promises.push(
          this.track(DEFAULT_SESSION_END_EVENT, undefined, {
            device_id: this.previousSessionDeviceId,
            event_id: ++lastEventId,
            session_id: previousSessionId,
            time: lastEventTime + 1,
            user_id: this.previousSessionUserId,
          }).promise,
        );
      }
      this.config.lastEventTime = this.config.sessionId;
    }

    // Fire web attribution event when enable webAttribution tracking
    // 1. has new campaign (call setSessionId from init function)
    // 2. or shouldTrackNewCampaign (call setSessionId from async process(event) when there has new campaign and resetSessionOnNewCampaign = true )
    const isCampaignEventTracked = this.trackCampaignEventIfNeeded(++lastEventId, promises);

    if (isSessionTrackingEnabled(this.config.defaultTracking)) {
      promises.push(
        this.track(DEFAULT_SESSION_START_EVENT, undefined, {
          event_id: isCampaignEventTracked ? ++lastEventId : lastEventId,
          session_id: this.config.sessionId,
          time: this.config.lastEventTime,
        }).promise,
      );
    }

    this.previousSessionDeviceId = this.config.deviceId;
    this.previousSessionUserId = this.config.userId;
    return returnWrapper(Promise.all(promises));
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

  private trackCampaignEventIfNeeded(lastEventId?: number, promises?: Promise<Result>[]) {
    if (!this.webAttribution || !this.webAttribution.shouldTrackNewCampaign) {
      return false;
    }

    const campaignEvent = this.webAttribution.generateCampaignEvent(lastEventId);
    if (promises) {
      promises.push(this.track(campaignEvent).promise);
    } else {
      this.track(campaignEvent);
    }
    this.config.loggerProvider.log('Tracking attribution.');
    return true;
  }

  async process(event: Event) {
    const currentTime = Date.now();
    const isEventInNewSession = isNewSession(this.config.sessionTimeout, this.config.lastEventTime);
    const shouldSetSessionIdOnNewCampaign =
      this.webAttribution && this.webAttribution.shouldSetSessionIdOnNewCampaign();

    if (
      event.event_type !== DEFAULT_SESSION_START_EVENT &&
      event.event_type !== DEFAULT_SESSION_END_EVENT &&
      (!event.session_id || event.session_id === this.getSessionId())
    ) {
      if (isEventInNewSession || shouldSetSessionIdOnNewCampaign) {
        this.setSessionId(currentTime);
        if (shouldSetSessionIdOnNewCampaign) {
          this.config.loggerProvider.log('Created a new session for new campaign.');
        }
      } else if (!isEventInNewSession) {
        // Web attribution should be tracked during the middle of a session
        // if there has been a chance in the campaign information.
        this.trackCampaignEventIfNeeded();
      }
    }

    return super.process(event);
  }

  private logBrowserOptions(browserConfig: BrowserOptions & { apiKey: string }) {
    try {
      const browserConfigCopy = {
        ...browserConfig,
        apiKey: browserConfig.apiKey.substring(0, 10) + '********',
      };
      this.config.loggerProvider.debug('Initialized Amplitude with BrowserConfig:', JSON.stringify(browserConfigCopy));
    } catch (e) {
      /* istanbul ignore next */
      this.config.loggerProvider.error('Error logging browser config', e);
    }
  }
}
