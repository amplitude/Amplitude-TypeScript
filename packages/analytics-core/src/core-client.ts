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
import { deregister, flush, push, register } from './timeline';
import { buildResult } from './utils/result-builder';
export class AmplitudeCore<T extends Config> implements CoreClient<T> {
  name: string;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: T;

  constructor(name = '$default') {
    this.name = name;
  }

  // NOTE: Do not use `_apiKey` and `_userId` here
  init(_apiKey: string | undefined, _userId: string | undefined, config: T) {
    this.config = config;
    return Promise.resolve();
  }

  track(eventInput: BaseEvent | string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    const event = createTrackEvent(eventInput, eventProperties, eventOptions);
    return this.dispatch(event);
  }

  logEvent = this.track.bind(this);

  identify(identify: Identify, eventOptions?: EventOptions, userId?: string, deviceId?: string) {
    const event = createIdentifyEvent(userId, deviceId, identify, eventOptions);
    return this.dispatch(event);
  }

  groupIdentify(
    groupType: string,
    groupName: string | string[],
    identify: Identify,
    eventOptions?: EventOptions,
    userId?: string,
    deviceId?: string,
  ) {
    const event = createGroupIdentifyEvent(userId, deviceId, groupType, groupName, identify, eventOptions);
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
    return register(plugin, config);
  }

  async remove(pluginName: string) {
    const config = this.config;
    return deregister(pluginName, config);
  }

  async dispatch(event: Event) {
    try {
      const result = await push(event, this.config);
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
    const config = this.config;
    return flush(config);
  }
}
