import { Plugin } from './types/plugin';
import { IConfig } from './config';
import { BaseEvent, EventOptions } from './types/event/base-event';
import { Result } from './types/result';
import { Event } from './types/event/event';
import { IIdentify } from './identify';
import { IRevenue } from './revenue';
import { CLIENT_NOT_INITIALIZED, OPT_OUT_MESSAGE } from './types/messages';
import { Timeline } from './timeline';
import {
  createGroupEvent,
  createGroupIdentifyEvent,
  createIdentifyEvent,
  createRevenueEvent,
  createTrackEvent,
} from './utils/event-builder';
import { buildResult } from './utils/result-builder';
import { returnWrapper } from './utils/return-wrapper';
import { AmplitudeReturn } from './utils/return-wrapper';

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
  identify(identify: IIdentify, eventOptions?: EventOptions): AmplitudeReturn<Result>;

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
    identify: IIdentify,
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
  revenue(revenue: IRevenue, eventOptions?: EventOptions): AmplitudeReturn<Result>;

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

export class AmplitudeCore implements CoreClient {
  protected initializing = false;
  protected name: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: IConfig;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  timeline: Timeline;
  isReady = false;
  protected q: Array<CallableFunction | typeof returnWrapper> = [];
  protected dispatchQ: Array<CallableFunction> = [];

  constructor(name = '$default') {
    this.timeline = new Timeline(this);
    this.name = name;
  }

  protected async _init(config: IConfig) {
    this.config = config;
    this.timeline.reset(this);
    await this.runQueuedFunctions('q');
    this.isReady = true;
  }

  async runQueuedFunctions(queueName: 'q' | 'dispatchQ') {
    const queuedFunctions = this[queueName];
    this[queueName] = [];
    for (const queuedFunction of queuedFunctions) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const val: ReturnType<typeof returnWrapper> | Promise<any> = queuedFunction();
      if (val && 'promise' in val) {
        await val.promise;
      } else {
        await val;
      }
    }
    // Rerun queued functions if the queue has accrued more while awaiting promises
    if (this[queueName].length) {
      await this.runQueuedFunctions(queueName);
    }
  }

  track(eventInput: BaseEvent | string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    const event = createTrackEvent(eventInput, eventProperties, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  logEvent = this.track.bind(this);

  identify(identify: IIdentify, eventOptions?: EventOptions) {
    const event = createIdentifyEvent(identify, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  groupIdentify(groupType: string, groupName: string | string[], identify: IIdentify, eventOptions?: EventOptions) {
    const event = createGroupIdentifyEvent(groupType, groupName, identify, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions) {
    const event = createGroupEvent(groupType, groupName, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  revenue(revenue: IRevenue, eventOptions?: EventOptions) {
    const event = createRevenueEvent(revenue, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  add(plugin: Plugin) {
    if (!this.isReady) {
      this.q.push(this._addPlugin.bind(this, plugin));
      return returnWrapper();
    }
    return this._addPlugin(plugin);
  }

  _addPlugin(plugin: Plugin) {
    return returnWrapper(this.timeline.register(plugin, this.config));
  }

  remove(pluginName: string) {
    if (!this.isReady) {
      this.q.push(this._removePlugin.bind(this, pluginName));
      return returnWrapper();
    }
    return this._removePlugin(pluginName);
  }

  _removePlugin(pluginName: string) {
    return returnWrapper(this.timeline.deregister(pluginName, this.config));
  }

  dispatchWithCallback(event: Event, callback: (result: Result) => void): void {
    if (!this.isReady) {
      return callback(buildResult(event, 0, CLIENT_NOT_INITIALIZED));
    }
    void this.process(event).then(callback);
  }

  async dispatch(event: Event): Promise<Result> {
    if (!this.isReady) {
      return new Promise<Result>((resolve) => {
        this.dispatchQ.push(this.dispatchWithCallback.bind(this, event, resolve));
      });
    }

    return this.process(event);
  }

  async process(event: Event): Promise<Result> {
    try {
      // skip event processing if opt out
      if (this.config.optOut) {
        return buildResult(event, 0, OPT_OUT_MESSAGE);
      }

      const result = await this.timeline.push(event);

      result.code === 200
        ? this.config.loggerProvider.log(result.message)
        : result.code === 100
        ? this.config.loggerProvider.warn(result.message)
        : this.config.loggerProvider.error(result.message);

      return result;
    } catch (e) {
      const message = String(e);
      this.config.loggerProvider.error(message);
      const result = buildResult(event, 0, message);

      return result;
    }
  }

  setOptOut(optOut: boolean) {
    if (!this.isReady) {
      this.q.push(this._setOptOut.bind(this, Boolean(optOut)));
      return;
    }
    this._setOptOut(optOut);
  }

  _setOptOut(optOut: boolean) {
    this.config.optOut = Boolean(optOut);
  }

  flush() {
    return returnWrapper(this.timeline.flush());
  }
}
