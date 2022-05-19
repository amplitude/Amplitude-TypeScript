import { AmplitudeReturn } from './amplitude-promise';
import { BaseEvent, EventOptions } from './base-event';
import { BrowserConfig, Config, NodeConfig } from './config';
import { Identify, Revenue } from './event';
import { Plugin } from './plugin';
import { Result } from './result';
import { TransportType } from './transport';

/**
 * Initializes the Amplitude SDK with your apiKey, userId and optional configurations.
 * This method must be called before any other operations.
 *
 * ```typescript
 * await init(API_KEY, USER_ID, options).promise;
 * ```
 */
type Init<T extends Config> = (apiKey: string, userId?: string, options?: T) => AmplitudeReturn<void>;

/**
 * Adds a new plugin.
 *
 * ```typescript
 * const plugin = {
 *   name: 'myPlugin',
 *   type: PluginType.ENRICHMENT,
 *   setup(config: Config) {
 *     return;
 *   },
 *   execute(context: Event) {
 *     return context;
 *   },
 * };
 * amplitude.add(plugin);
 * ```
 */
type Add = (plugin: Plugin) => AmplitudeReturn<void>;

/**
 * Removes a plugin.
 *
 * ```typescript
 * amplitude.remove('myPlugin');
 * ```
 */
type Remove = (pluginName: string) => AmplitudeReturn<void>;

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
type Track = (
  eventInput: BaseEvent | string,
  eventProperties?: Record<string, any>,
  eventOptions?: EventOptions,
) => AmplitudeReturn<Result>;

/**
 * Alias for track()
 */
type LogEvent = Track;

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
type TrackIdentify = (
  identify: Identify,
  eventOptions?: EventOptions,
  userId?: string,
  deviceId?: string,
) => AmplitudeReturn<Result>;

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
type TrackGroupIdentify = (
  groupType: string,
  groupName: string | string[],
  identify: Identify,
  eventOptions?: EventOptions,
  userId?: string,
  deviceId?: string,
) => AmplitudeReturn<Result>;

type TrackSetGroup = (groupType: string, groupName: string | string[]) => AmplitudeReturn<Result>;

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
type TrackRevenue = (revenue: Revenue, eventOptions?: EventOptions) => AmplitudeReturn<Result>;

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
type SetOptOut = (optOut: boolean) => void;

export interface CoreClient<T extends Config = Config> {
  init: Init<T>;
  add: Add;
  remove: Remove;
  track: Track;
  logEvent: LogEvent;
  identify: TrackIdentify;
  groupIdentify: TrackGroupIdentify;
  setGroup: TrackSetGroup;
  revenue: TrackRevenue;
  setOptOut: SetOptOut;
}

/**
 * Flush all unsent events.
 *
 *```typescript
 * flush();
 * ```
 */
type Flush = () => AmplitudeReturn<void>;
export interface NodeClient extends CoreClient<NodeConfig> {
  flush: Flush;
}

/**
 * Returns current user ID.
 *
 * ```typescript
 * const userId = getUserId();
 * ```
 */
type GetUserId = () => string | undefined;

/**
 * Sets a new user ID.
 *
 * ```typescript
 * setUserId('userId');
 * ```
 */
type SetUserId = (userId: string) => void;

/**
 * Returns current device ID.
 *
 * ```typescript
 * const deviceId = getDeviceId();
 * ```
 */
type GetDeviceId = () => string | undefined;

/**
 * Sets a new device ID.
 * When setting a custom device ID, make sure the value is sufficiently unique.
 * A uuid is recommended.
 *
 * ```typescript
 * setDeviceId('deviceId');
 * ```
 */
type SetDeviceId = (deviceId: string) => void;

/**
 * Returns current session ID.
 *
 * ```typescript
 * const sessionId = getSessionId();
 * ```
 */
type GetSessionId = () => number | undefined;

/**
 * Sets a new session ID.
 * When settign a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
 *
 * ```typescript
 * setSessionId(Date.now());
 * ```
 */
type SetSessionId = (sessionId: number) => void;

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
type SetTransport = (transport: TransportType) => void;

export interface BrowserClient extends CoreClient<BrowserConfig> {
  getUserId: GetUserId;
  setUserId: SetUserId;
  getDeviceId: GetDeviceId;
  setDeviceId: SetDeviceId;
  getSessionId: GetSessionId;
  setSessionId: SetSessionId;
  setTransport: SetTransport;
}

type CreateInstance<T extends CoreClient<U>, U extends Config> = (instanceName: string) => T;
export type CreateBrowserInstance = CreateInstance<BrowserClient, BrowserConfig>;
export type CreateNodeInstance = CreateInstance<NodeClient, NodeConfig>;
