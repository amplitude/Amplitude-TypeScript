import {
  BaseEvent,
  Config,
  CoreClient,
  Event,
  EventOptions,
  Identify,
  Plugin,
  Result,
  Revenue,
} from '@amplitude/analytics-types';
import { CLIENT_NOT_INITIALIZED, OPT_OUT_MESSAGE } from './messages';
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

export class AmplitudeCore implements CoreClient {
  protected initializing = false;
  protected name: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
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

  protected async _init(config: Config) {
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
  }

  track(eventInput: BaseEvent | string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    const event = createTrackEvent(eventInput, eventProperties, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  logEvent = this.track.bind(this);

  identify(identify: Identify, eventOptions?: EventOptions) {
    const event = createIdentifyEvent(identify, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  groupIdentify(groupType: string, groupName: string | string[], identify: Identify, eventOptions?: EventOptions) {
    const event = createGroupIdentifyEvent(groupType, groupName, identify, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions) {
    const event = createGroupEvent(groupType, groupName, eventOptions);
    return returnWrapper(this.dispatch(event));
  }

  revenue(revenue: Revenue, eventOptions?: EventOptions) {
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
    return returnWrapper(this.timeline.deregister(pluginName));
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
