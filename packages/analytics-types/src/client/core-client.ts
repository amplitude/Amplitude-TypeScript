// import { Config } from '../config';
import { AmplitudeReturn } from '../amplitude-promise';
import { BaseEvent, EventOptions } from '../base-event';
import { Identify, Revenue } from '../event';
import { Plugin } from '../plugin';
import { Result } from '../result';

export interface CoreClient {
  /**
   * Adds a new plugin.
   *
   * ```typescript
   * const plugin = {
   *   name: 'myPlugin',
   *   type: 'enrichment',
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
  add(plugin: Plugin): AmplitudeReturn<void>;

  /**
   * Removes a plugin.
   *
   * ```typescript
   * amplitude.remove('myPlugin');
   * ```
   */
  remove(pluginName: string): AmplitudeReturn<void>;

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
  track(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result>;

  /**
   * Alias for track()
   */
  logEvent(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result>;

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
  identify(identify: Identify, eventOptions?: EventOptions): AmplitudeReturn<Result>;

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
  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: Identify,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result>;

  /**
   * Assigns a user to group
   *
   * ```typescript
   * const groupType = 'orgId';
   * const groupName = '15';
   * setGroup(groupType, groupName, { user_id: '12345' })
   * ```
   */
  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions): AmplitudeReturn<Result>;

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
  revenue(revenue: Revenue, eventOptions?: EventOptions): AmplitudeReturn<Result>;

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
  setOptOut(optOut: boolean): void;

  /**
   * Flush all unsent events.
   *
   *```typescript
   * flush();
   * ```
   */
  flush(): AmplitudeReturn<void>;
}
