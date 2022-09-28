import { BeforePlugin, Event, PluginType } from '@amplitude/analytics-types';
import { AmplitudeBrowser } from '../browser-client';
import { MeasurementStates } from '@amplitude/analytics-core';

interface loggerState {
  key: string;
  arguments?: any[];
  callStacks?: string[];
  name: string;
  time: string;
  config: string;
}

export class Logger implements BeforePlugin {
  name = 'logger';
  type = PluginType.BEFORE as const;

  constructor(private readonly instance: AmplitudeBrowser) {}

  async setup() {
    const stateMap = new Map<string, loggerState>();
    this.instance.messageBus.subscribeAll(({ messageType, args }) => {
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
            console.log(JSON.stringify(stateStart.arguments, null, 2));
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
            console.log(
              `%cMethod call duration: ${new Date(stateEnd.time).getTime() - new Date(stateStart.time).getTime()} ms`,
              'color: lightgreen',
            );

            console.groupEnd();
            console.groupEnd();
          }
          return;
        }
      }
    });
  }

  async execute(event: Event): Promise<Event> {
    return event;
  }
}
