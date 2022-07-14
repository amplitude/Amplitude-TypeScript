import { AmplitudeCore, Destination, returnWrapper } from '@amplitude/analytics-core';
import {
  ReactNativeConfig,
  Campaign,
  TransportType,
  ReactNativeOptions,
  AdditionalReactNativeOptions,
  AttributionReactNativeOptions,
} from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useReactNativeConfig, createTransport, createDeviceId, createFlexibleStorage } from './config';
import { parseOldCookies } from './cookie-migration';
import { CampaignTracker } from './attribution/campaign-tracker';
import { isNative } from './utils/platform';
import { AnalyticsConnector } from '@amplitude/analytics-connector';
import { IdentityEventSender } from './plugins/identity';

const DEFAULT_INSTANCE_NAME = '$default_instance';

export class AmplitudeReactNative extends AmplitudeCore<ReactNativeConfig> {
  async init(apiKey: string, userId?: string, options?: ReactNativeOptions & AdditionalReactNativeOptions) {
    // Step 1: Read cookies stored by old SDK
    const oldCookies = await parseOldCookies(apiKey, options);

    // Step 2: Create react native config
    const reactNativeOptions = await useReactNativeConfig(apiKey, userId || oldCookies.userId, {
      ...options,
      deviceId: oldCookies.deviceId ?? options?.deviceId,
      sessionId: oldCookies.sessionId ?? options?.sessionId,
      optOut: options?.optOut ?? oldCookies.optOut,
      lastEventTime: oldCookies.lastEventTime,
    });
    await super.init(undefined, undefined, reactNativeOptions);

    // Step 3: Manage session
    let isNewSession = false;
    if (
      !this.config.sessionId ||
      (this.config.lastEventTime && Date.now() - this.config.lastEventTime > this.config.sessionTimeout)
    ) {
      // Either
      // 1) No previous session; or
      // 2) Previous session expired
      this.config.sessionId = Date.now();
      isNewSession = true;
    }

    const connector = AnalyticsConnector.getInstance(DEFAULT_INSTANCE_NAME);
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

    // Step 5: Track attributions
    await this.runAttributionStrategy(options?.attribution, isNewSession);
  }

  async runAttributionStrategy(attributionConfig?: AttributionReactNativeOptions, isNewSession = false) {
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
    return this.config.userId;
  }

  setUserId(userId: string | undefined) {
    this.config.userId = userId;
    AnalyticsConnector.getInstance(DEFAULT_INSTANCE_NAME)
      .identityStore// eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .editIdentity()
      .setUserId(userId)
      .commit();
  }

  getDeviceId() {
    return this.config.deviceId;
  }

  setDeviceId(deviceId: string) {
    this.config.deviceId = deviceId;
    AnalyticsConnector.getInstance(DEFAULT_INSTANCE_NAME)
      .identityStore// eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      .editIdentity()
      .setDeviceId(deviceId)
      .commit();
  }

  regenerateDeviceId() {
    const deviceId = createDeviceId();
    this.setDeviceId(deviceId);
  }

  getSessionId() {
    return this.config.sessionId;
  }

  setSessionId(sessionId: number) {
    this.config.sessionId = sessionId;
  }

  setOptOut(optOut: boolean) {
    this.config.optOut = optOut;
  }

  setTransport(transport: TransportType) {
    this.config.transportProvider = createTransport(transport);
  }
}

const client = new AmplitudeReactNative();

/**
 * Initializes the Amplitude SDK with your apiKey, userId and optional configurations.
 * This method must be called before any other operations.
 *
 * ```typescript
 * await init(API_KEY, USER_ID, options).promise;
 * ```
 */
export const init = returnWrapper(client.init.bind(client));

/**
 * Adds a new plugin.
 *
 * ```typescript
 * const plugin = {...};
 * amplitude.add(plugin);
 * ```
 */
export const add = returnWrapper(client.add.bind(client));

/**
 * Removes a plugin.
 *
 * ```typescript
 * amplitude.remove('myPlugin');
 * ```
 */
export const remove = returnWrapper(client.remove.bind(client));

/**
 * Tracks user-defined event, with specified type, optional event properties and optional overwrites.
 *
 * ```typescript
 * // event tracking with event type only
 * track('Page Load');
 *
 * // event tracking with event type and additional event properties
 * track('Page Load', { loadTime: 1000 });
 *
 * // event tracking with event type, additional event properties, and overwritten event options
 * track('Page Load', { loadTime: 1000 }, { sessionId: -1 });
 *
 * // alternatively, this tracking method is awaitable
 * const result = await track('Page Load').promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const track = returnWrapper(client.track.bind(client));

/**
 * Alias for track()
 */
export const logEvent = returnWrapper(client.logEvent.bind(client));

/**
 * Sends an identify event containing user property operations
 *
 * ```typescript
 * const id = new Identify();
 * id.set('colors', ['rose', 'gold']);
 * identify(id);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await identify(id).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const identify = returnWrapper(client.identify.bind(client));

/**
 * Sends a group identify event containing group property operations.
 *
 * ```typescript
 * const id = new Identify();
 * id.set('skills', ['js', 'ts']);
 * const groupType = 'org';
 * const groupName = 'engineering';
 * groupIdentify(groupType, groupName, id);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await groupIdentify(groupType, groupName, id).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const groupIdentify = returnWrapper(client.groupIdentify.bind(client));
export const setGroup = returnWrapper(client.setGroup.bind(client));

/**
 * Sends a revenue event containing revenue property operations.
 *
 * ```typescript
 * const rev = new Revenue();
 * rev.setRevenue(100);
 * revenue(rev);
 *
 * // alternatively, this tracking method is awaitable
 * const result = await revenue(rev).promise;
 * console.log(result.event); // {...}
 * console.log(result.code); // 200
 * console.log(result.message); // "Event tracked successfully"
 * ```
 */
export const revenue = returnWrapper(client.revenue.bind(client));

/**
 * Returns current user ID.
 *
 * ```typescript
 * const userId = getUserId();
 * ```
 */
export const getUserId = client.getUserId.bind(client);

/**
 * Sets a new user ID.
 *
 * ```typescript
 * setUserId('userId');
 * ```
 */
export const setUserId = client.setUserId.bind(client);

/**
 * Returns current device ID.
 *
 * ```typescript
 * const deviceId = getDeviceId();
 * ```
 */
export const getDeviceId = client.getDeviceId.bind(client);

/**
 * Sets a new device ID.
 * When setting a custom device ID, make sure the value is sufficiently unique.
 * A uuid is recommended.
 *
 * ```typescript
 * setDeviceId('deviceId');
 * ```
 */
export const setDeviceId = client.setDeviceId.bind(client);

/**
 * Regenerates a new random deviceId for current user. Note: this is not recommended unless you know what you
 * are doing. This can be used in conjunction with `setUserId(undefined)` to anonymize users after they log out.
 * With an `unefined` userId and a completely new deviceId, the current user would appear as a brand new user in dashboard.
 *
 * ```typescript
 * regenerateDeviceId();
 * ```
 */
export const regenerateDeviceId = client.regenerateDeviceId.bind(client);

/**
 * Returns current session ID.
 *
 * ```typescript
 * const sessionId = getSessionId();
 * ```
 */
export const getSessionId = client.getSessionId.bind(client);

/**
 * Sets a new session ID.
 * When settign a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
 *
 * ```typescript
 * setSessionId(Date.now());
 * ```
 */
export const setSessionId = client.setSessionId.bind(client);

/**
 * Sets a new optOut config value. This toggles event tracking on/off.
 *
 *```typescript
 * // Stops tracking
 * setOptOut(true);
 *
 * // Starts/resumes tracking
 * setOptOut(false);
 * ```
 */
export const setOptOut = client.setOptOut.bind(client);

/**
 *  Sets the network transport type for events.
 *
 * ```typescript
 * // Use Fetch API
 * setTransport('fetch');
 *
 * // Use XMLHttpRequest API
 * setTransport('xhr');
 *
 * // Use navigator.sendBeacon API
 * setTransport('beacon');
 * ```
 */
export const setTransport = client.setTransport.bind(client);

/**
 * Flush and send all the events which haven't been sent.
 *
 *```typescript
 * // Send all the unsent events
 * flush();
 *
 * // alternatively, this tracking method is awaitable
 * await flush().promise;
 * ```
 */
export const flush = returnWrapper(client.flush.bind(client));
