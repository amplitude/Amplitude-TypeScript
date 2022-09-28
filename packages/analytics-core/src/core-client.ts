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
import { MessageBus, MeasurementStates } from './utils/message-bus';

interface loggerState {
  key: string;
  arguments?: any[];
  paramNames?: string[];
  callStacks?: string[];
  name: string;
  time: number;
  config: string;
}

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
  public readonly messageBus: MessageBus;

  constructor(name = '$default') {
    this.timeline = new Timeline();
    this.name = name;
    this.messageBus = new MessageBus();

    const stateMap = new Map<string, loggerState>();

    this.messageBus.subscribeAll(({ messageType, args }) => {
      switch (messageType) {
        case MeasurementStates.START: {
          const state = args[0] as loggerState;
          stateMap.set(state.key, state);
          return;
        }
        case MeasurementStates.END: {
          const stateEnd = args[0] as loggerState;
          const stateType = stateEnd.key.split('_')[0];
          const stateStart = stateMap.get(stateEnd.key);

          if (stateStart) {
            /** Start */
            console.group(`%c[Browser SDK - ${stateType}] ${stateStart.name}`, 'color: lightyellow; font-size: bold');
            console.group(
              `%c[${new Date(stateStart.time).toLocaleTimeString()}] Start:`,
              'color: lightsalmon; font-size: bold',
            );
            /** Group */
            console.groupCollapsed('method arguments:');
            if (stateStart.paramNames) {
              const data = stateStart.paramNames.map((name: string, index: number) => ({
                paramName: name,
                paramArg:
                  typeof stateStart.arguments?.[index] === 'string'
                    ? (stateStart.arguments[index] as string)
                    : JSON.stringify(stateStart.arguments?.[index]),
              }));
              console.table(data);
            }
            console.log(JSON.stringify(stateStart.arguments, null, 2) || undefined);
            console.groupEnd();

            /** Group */
            console.groupCollapsed('SDK config:');
            console.log(`%c${stateStart.config}`, 'color: lightgreen');
            console.groupEnd();

            /** Group */
            console.groupCollapsed('call stacks:');
            console.log(`%c${stateStart.callStacks?.join('\n') || 'N/A'}`, 'color: lightyellow');
            console.groupEnd();
            console.groupEnd();

            /** End */
            console.group(
              `%c[${new Date(stateEnd.time).toLocaleTimeString()}] End:`,
              'color: lightsalmon; font-size: bold',
            );
            /** Group */
            console.groupCollapsed('SDK config:');
            console.log(`%c${stateEnd.config}`, 'color: lightgreen');
            console.groupEnd();

            /** Log */
            console.log(`%cMethod call duration: ${stateEnd.time - stateStart.time} ms`, 'color: lightgreen');

            console.groupEnd();
            console.groupEnd();
          }
          return;
        }
      }
    });
  }

  // @emitInternalApi
  async _init(config: T) {
    this.config = config;
    this.timeline.reset();
    const queuedFunctions = this.q;
    this.q = [];
    for (const queuedFunction of queuedFunctions) {
      await queuedFunction();
    }
  }

  // @emitInternalApi
  track(eventInput: BaseEvent | string, eventProperties?: Record<string, any>, eventOptions?: EventOptions) {
    const event = createTrackEvent(eventInput, eventProperties, eventOptions);
    return this.dispatch(event);
  }

  logEvent = this.track.bind(this);

  // @emitInternalApi
  identify(identify: Identify, eventOptions?: EventOptions) {
    const event = createIdentifyEvent(identify, eventOptions);
    return this.dispatch(event);
  }

  // @emitInternalApi
  groupIdentify(groupType: string, groupName: string | string[], identify: Identify, eventOptions?: EventOptions) {
    const event = createGroupIdentifyEvent(groupType, groupName, identify, eventOptions);
    return this.dispatch(event);
  }

  // @emitInternalApi
  setGroup(groupType: string, groupName: string | string[], eventOptions?: EventOptions) {
    const event = createGroupEvent(groupType, groupName, eventOptions);
    return this.dispatch(event);
  }

  // @emitInternalApi
  revenue(revenue: Revenue, eventOptions?: EventOptions) {
    const event = createRevenueEvent(revenue, eventOptions);
    return this.dispatch(event);
  }

  // @emitInternalApi
  async add(plugin: Plugin) {
    if (!this.config) {
      this.q.push(this.add.bind(this, plugin));
      return;
    }
    return this.timeline.register(plugin, this.config);
  }

  // @emitInternalApi
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
