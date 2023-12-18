import {
  getAnalyticsConnector,
  getCookieName,
  getPageViewTrackingConfig,
  getQueryParams,
  IdentityEventSender,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isSessionTrackingEnabled,
  setConnectorDeviceId,
  setConnectorOptOut,
  setConnectorUserId,
} from '@amplitude/analytics-client-common';
import { AmplitudeCore, Destination, Identify, returnWrapper, Revenue, UUID } from '@amplitude/analytics-core';
import {
  BrowserClient,
  BrowserConfig,
  BrowserOptions,
  Event,
  EventOptions,
  Identify as IIdentify,
  Revenue as IRevenue,
  TransportType,
  UserSession,
} from '@amplitude/analytics-types';
import { pageViewTrackingPlugin } from '@amplitude/plugin-page-view-tracking-browser';
import { webAttributionPlugin } from '@amplitude/plugin-web-attribution-browser';
import { createCookieStorage, createTransport, getTopLevelDomain, useBrowserConfig } from './config';
import { DEFAULT_PAGE_VIEW_EVENT, DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_START_EVENT } from './constants';
import { parseLegacyCookies } from './cookie-migration';
import { Context } from './plugins/context';
import { defaultPageViewEventEnrichment } from './plugins/default-page-view-event-enrichment';
import { fileDownloadTracking } from './plugins/file-download-tracking';
import { formInteractionTracking } from './plugins/form-interaction-tracking';
import { convertProxyObjectToRealObject, isInstanceProxy } from './utils/snippet-helper';

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
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    // Step 1: Read cookies stored by SDK
    options.domain = options.disableCookies ? '' : options.domain ?? (await getTopLevelDomain());
    const legacyCookies = await parseLegacyCookies(options.apiKey, options);
    const cookieStorage = await createCookieStorage<UserSession>(options);
    const previousCookies = await cookieStorage.get(getCookieName(options.apiKey));
    const queryParams = getQueryParams();

    // Step 2: Create browser config
    const deviceId = options.deviceId ?? queryParams.deviceId ?? previousCookies?.deviceId ?? legacyCookies.deviceId;
    const sessionId = previousCookies?.sessionId ?? legacyCookies.sessionId;
    const optOut = options.optOut ?? previousCookies?.optOut ?? legacyCookies.optOut;
    const lastEventId = previousCookies?.lastEventId ?? legacyCookies.lastEventId;
    const lastEventTime = previousCookies?.lastEventTime ?? legacyCookies.lastEventTime;
    const userId = options.userId ?? previousCookies?.userId ?? legacyCookies.userId;

    this.previousSessionDeviceId = previousCookies?.deviceId ?? legacyCookies.deviceId;
    this.previousSessionUserId = previousCookies?.userId ?? legacyCookies.userId;

    const browserOptions = await useBrowserConfig(options.apiKey, {
      ...options,
      deviceId,
      sessionId,
      optOut,
      lastEventId,
      lastEventTime,
      userId,
      cookieStorage,
    });

    // Step 3: Set session ID
    let isNewSession = false;
    if (
      // user has never sent an event
      !browserOptions.lastEventTime ||
      // user has no previous session ID
      !browserOptions.sessionId ||
      // has sent an event and has previous session but expired
      (browserOptions.lastEventTime && Date.now() - browserOptions.lastEventTime > browserOptions.sessionTimeout)
    ) {
      // we need to set the session ID before plugins run
      // add it to the front of the queue
      this.q.unshift(this.setSessionId.bind(this, options.sessionId ?? browserOptions.sessionId ?? Date.now()));
      isNewSession = true;
    }

    await super._init(browserOptions);

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
    await this.add(new Destination()).promise;
    await this.add(new Context()).promise;
    await this.add(new IdentityEventSender()).promise;

    if (isFileDownloadTrackingEnabled(this.config.defaultTracking)) {
      await this.add(fileDownloadTracking()).promise;
    }

    if (isFormInteractionTrackingEnabled(this.config.defaultTracking)) {
      await this.add(formInteractionTracking()).promise;
    }

    // Add web attribution plugin
    if (!this.config.attribution?.disabled) {
      const webAttribution = webAttributionPlugin({
        excludeReferrers: this.config.attribution?.excludeReferrers,
        initialEmptyValue: this.config.attribution?.initialEmptyValue,
        resetSessionOnNewCampaign: this.config.attribution?.resetSessionOnNewCampaign,
      });

      // For Amplitude-internal functionality
      // if pluginEnabledOverride === undefined then use plugin default logic
      // if pluginEnabledOverride === true then track attribution
      // if pluginEnabledOverride === false then do not track attribution
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (webAttribution as any).__pluginEnabledOverride =
        isNewSession || this.config.attribution?.trackNewCampaigns ? undefined : false;
      await this.add(webAttribution).promise;
    }

    // Add page view plugin
    const pageViewTrackingOptions = getPageViewTrackingConfig(this.config);
    pageViewTrackingOptions.eventType = pageViewTrackingOptions.eventType || DEFAULT_PAGE_VIEW_EVENT;
    await this.add(pageViewTrackingPlugin(pageViewTrackingOptions)).promise;
    await this.add(defaultPageViewEventEnrichment()).promise;

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

  setOptOut(optOut: boolean): void {
    setConnectorOptOut(optOut, this.config.instanceName);
    super.setOptOut(optOut);
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
    const lastEventTime = this.config.lastEventTime || Date.now();
    const timeSinceLastEvent = currentTime - lastEventTime;

    if (
      event.event_type !== DEFAULT_SESSION_START_EVENT &&
      event.event_type !== DEFAULT_SESSION_END_EVENT &&
      (!event.session_id || event.session_id === this.getSessionId()) &&
      timeSinceLastEvent > this.config.sessionTimeout
    ) {
      this.setSessionId(currentTime);
    }

    return super.process(event);
  }
}
