import { MessageBus, MeasurementStates } from './message-bus';

interface loggerState {
  key: string;
  arguments?: any[];
  paramNames?: string[];
  callStacks?: string[];
  name: string;
  time: number;
  config: string;
  innerCalls?: loggerState[];
  stateEnd?: loggerState;
}

export const logger = (messageBus: MessageBus) => {
  const stateMap = new Map<string, loggerState>();

  messageBus.subscribeAll(({ messageType, args }) => {
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
          stateStart.stateEnd = stateEnd;
          if (stateType === 'InternalApi') {
            mapToParent(stateMap, stateStart.callStacks, stateStart);
            stateMap.delete(stateEnd.key);
            return;
          }

          renderResults(stateStart);
          stateMap.delete(stateEnd.key);
        }
        return;
      }
    }
  });
};

function mapToParent(stateMap: Map<string, loggerState>, callStacks: string[] = [], state: loggerState) {
  const mostRecentCallLog = callStacks
    .map((call) => call.slice(3).split(' ')[0])
    .find((call) => ['PublicApi_', 'InternalApi_'].some((prefix) => call.startsWith(prefix)));

  if (mostRecentCallLog) {
    const parentState = stateMap.get(mostRecentCallLog);

    if (parentState) {
      parentState.innerCalls = (parentState.innerCalls || []).concat(state);
    }
  }
}

function renderResults(stateStart: loggerState) {
  const stateType = stateStart.key.split('_')[0];
  const stateEnd = stateStart.stateEnd;

  /** Start */
  console.group(`%c[Browser SDK - ${stateType}] ${stateStart.name}`, 'color: lightyellow; font-size: bold');
  console.group(`%c[${new Date(stateStart.time).toLocaleTimeString()}] Start:`, 'color: lightsalmon; font-size: bold');
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
  if (stateType === 'PublicApi') {
    console.groupCollapsed('call stacks:');
    console.log(`%c${stateStart.callStacks?.join('\n') || 'N/A'}`, 'color: lightyellow');
    console.groupEnd();
  }

  /** Group */
  if (stateStart.innerCalls) {
    console.groupCollapsed('inner calls:');
    stateStart.innerCalls.forEach(renderResults);
    console.groupEnd();
  }
  console.groupEnd();

  /** End */
  if (stateEnd) {
    console.group(`%c[${new Date(stateEnd.time).toLocaleTimeString()}] End:`, 'color: lightsalmon; font-size: bold');
    /** Group */
    console.groupCollapsed('SDK config:');
    console.log(`%c${stateEnd.config}`, 'color: lightgreen');
    console.groupEnd();
    /** Log */
    console.log(`%cMethod call duration: ${stateEnd.time - stateStart.time} ms`, 'color: lightgreen');
  }

  console.groupEnd();
  console.groupEnd();
}
