import { AmplitudeCore, Destination, returnWrapper } from '@amplitude/analytics-core';
import { NodeConfig, NodeOptions } from '@amplitude/analytics-types';
import { Context } from './plugins/context';
import { useNodeConfig } from './config';

export class AmplitudeNode extends AmplitudeCore<NodeConfig> {
  async init(apiKey: string, options?: NodeOptions) {
    // Step 0: Block concurrent initialization
    if (this.initializing) {
      return;
    }
    this.initializing = true;

    const nodeOptions = useNodeConfig(apiKey, {
      ...options,
    });

    await super._init(nodeOptions);

    await this.add(new Context());
    await this.add(new Destination());

    this.initializing = false;

    // Set timeline ready for processing events
    // Send existing events, which might be collected by track before init
    this.timeline.isReady = true;
    if (!this.config.optOut) {
      this.timeline.scheduleApply(0);
    }
  }
}

const client = new AmplitudeNode();

/**
 * Initializes the Amplitude SDK with your apiKey and optional configurations.
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
 * add(plugin);
 *
 * // alternatively, this tracking method is awaitable
 * await add(plugin).promise;
 * ```
 */
export const add = returnWrapper(client.add.bind(client));

/**
 * Removes a plugin.
 *
 * ```typescript
 * remove('myPlugin');
 *
 * // alternatively, this tracking method is awaitable
 * await remove('myPlugin').promise;
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
