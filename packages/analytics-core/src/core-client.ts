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
export class AmplitudeCore<T extends Config> implements CoreClient<T> {
  name: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: T;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  timeline: Timeline;

  constructor(name = '$default') {
    this.name = name;
  }

  // NOTE: Do not use `_apiKey` and `_userId` here
  init(_apiKey: string | undefined, _userId: string | undefined, config: T) {
    this.config = config;
    this.timeline = new Timeline();
    return Promise.resolve();
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

  setGroup(groupType: string, groupName: string | string[]) {
    const event = createGroupEvent(groupType, groupName);
    return this.dispatch(event);
  }

  revenue(revenue: Revenue, eventOptions?: EventOptions) {
    const event = createRevenueEvent(revenue, eventOptions);
    return this.dispatch(event);
  }

  async add(plugin: Plugin) {
    const config = this.config;
    return this.timeline.register(plugin, config);
  }

  async remove(pluginName: string) {
    return this.timeline.deregister(pluginName);
  }

  async dispatch(event: Event) {
    try {
      const result = await this.timeline.push(event, this.config);
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
    const config = this.config;
    config.optOut = Boolean(optOut);
  }

  flush() {
    return this.timeline.flush();
  }
}
