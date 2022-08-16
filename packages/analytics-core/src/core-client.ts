import {
  CoreClient,
  Config,
  Event,
  BaseEvent,
  EventOptions,
  Identify,
  Plugin,
  Revenue,
} from '@amplitude/analytics-types';
import {
  createGroupIdentifyEvent,
  createIdentifyEvent,
  createTrackEvent,
  createRevenueEvent,
  createGroupEvent,
} from './utils/event-builder';
import { Timeline } from './timeline';
import { buildResult } from './utils/result-builder';
import { OPT_OUT_MESSAGE } from './messages';

export class AmplitudeCore<T extends Config> implements CoreClient<T> {
  initializing = false;
  name: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: T;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  timeline: Timeline;
  protected q: CallableFunction[] = [];

  constructor(name = '$default') {
    this.timeline = new Timeline();
    this.name = name;
  }

  async _init(config: T) {
    this.config = config;
    this.timeline.reset();
    const queuedFunctions = this.q;
    this.q = [];
    for (const queuedFunction of queuedFunctions) {
      await queuedFunction();
    }
  }

  track(eventInput: BaseEvent | string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    const event = createTrackEvent(eventInput, eventProperties, eventOptions);
    return this.dispatch(event);
  }

  logEvent = this.track.bind(this);

  identify(identify: Identify, eventOptions?: EventOptions) {
    const event = createIdentifyEvent(identify, eventOptions);
    return this.dispatch(event);
  }

  groupIdentify(groupType: string, groupName: string | string[], identify: Identify, eventOptions?: EventOptions) {
    const event = createGroupIdentifyEvent(groupType, groupName, identify, eventOptions);
    return this.dispatch(event);
  }

  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions) {
    const event = createGroupEvent(groupType, groupName, eventOptions);
    return this.dispatch(event);
  }

  revenue(revenue: Revenue, eventOptions?: EventOptions) {
    const event = createRevenueEvent(revenue, eventOptions);
    return this.dispatch(event);
  }

  async add(plugin: Plugin) {
    if (!this.config) {
      this.q.push(this.add.bind(this, plugin));
      return;
    }
    return this.timeline.register(plugin, this.config);
  }

  async remove(pluginName: string) {
    if (!this.config) {
      this.q.push(this.remove.bind(this, pluginName));
      return;
    }
    return this.timeline.deregister(pluginName);
  }

  async dispatch(event: Event) {
    try {
      // skip event processing if opt out
      if (this.config?.optOut) {
        return buildResult(event, 0, OPT_OUT_MESSAGE);
      }
      const result = await this.timeline.push(event);
      if (result.code === 200) {
        this.config.loggerProvider.log(result.message);
      } else {
        this.config.loggerProvider.error(result.message);
      }
      return result;
    } catch (e) {
      const message = String(e);
      this.config.loggerProvider.error(message);
      return buildResult(event, 0, message);
    }
  }

  setOptOut(optOut: boolean) {
    if (!this.config) {
      this.q.push(this.setOptOut.bind(this, Boolean(optOut)));
      return;
    }
    this.config.optOut = Boolean(optOut);
  }

  flush() {
    return this.timeline.flush();
  }
}
