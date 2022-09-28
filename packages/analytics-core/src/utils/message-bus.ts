/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AmplitudeCore } from '../core-client';
import { Config } from '../config';
import { UUID } from './uuid';
import { Logger } from '../logger';
import { getParamNames } from './getParamNames';

export interface MessageBusState {
  messageType: string | symbol;
  args: any[];
}

export type MessageBusCallback = (state: MessageBusState) => unknown | Promise<unknown>;

export const MeasurementStates = {
  START: 'MeasurementStart',
  END: 'MeasurementEnd',
};

export const emitMessage = (_target: AmplitudeCore<Config>, propertyKey: string, descriptor: PropertyDescriptor) => {
  const originalMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    const result = originalMethod.apply(this, args);
    (this as AmplitudeCore<Config>).messageBus.emit(propertyKey, args);

    return result;
  };

  Object.defineProperty(descriptor.value, 'name', {
    value: propertyKey,
    configurable: true,
  });

  return descriptor;
};

export const emitMessageAsync = (
  _target: AmplitudeCore<Config>,
  propertyKey: string,
  descriptor: PropertyDescriptor,
) => {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const result = await originalMethod.apply(this, args);
    (this as AmplitudeCore<Config>).messageBus.emit(propertyKey, args);

    return result;
  };

  Object.defineProperty(descriptor.value, 'name', {
    value: propertyKey,
    configurable: true,
  });

  return descriptor;
};

export const emitPublicApi = (client: any, fnName: string, fn: (...args: any[]) => any) => {
  const publicApiFn = (...args: any[]) => {
    const loggerKey = `PublicApi_${UUID()}`;

    client.messageBus.emit(MeasurementStates.START, [
      {
        key: loggerKey,
        name: fnName,
        callStacks: Logger.trace(),
        arguments: args,
        paramNames: getParamNames(fn),
        time: new Date().getTime(),
        config: JSON.stringify(client.config, null, 2),
      },
    ]);

    Object.defineProperty(fn, 'name', {
      value: loggerKey,
      configurable: true,
    });

    const result = fn.apply(client, args);

    if (result.promise) {
      result.promise.then(() => {
        client.messageBus.emit(MeasurementStates.END, [
          {
            key: loggerKey,
            name: fnName,
            time: new Date().getTime(),
            config: JSON.stringify(client.config, null, 2),
          },
        ]);
      });
    } else {
      client.messageBus.emit(MeasurementStates.END, [
        {
          key: loggerKey,
          name: fnName,
          time: new Date().getTime(),
          config: JSON.stringify(client.config, null, 2),
        },
      ]);
    }

    return result;
  };

  Object.defineProperty(publicApiFn, 'name', {
    value: fnName,
    configurable: true,
  });

  return publicApiFn;
};

export const emitInternalApi = (_target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const originalMethod = descriptor.value;
  descriptor.value = async function (...args: any[]) {
    const loggerKey = `InternalApi_${UUID()}`;
    Object.defineProperty(originalMethod, 'name', {
      value: loggerKey,
      configurable: true,
    });

    (this as AmplitudeCore<Config>).messageBus.emit(MeasurementStates.START, [
      {
        key: loggerKey,
        name: propertyKey,
        callStacks: Logger.trace(),
        arguments: args,
        paramNames: getParamNames(originalMethod as () => unknown),
        time: new Date().getTime(),
        config: JSON.stringify((this as AmplitudeCore<Config>).config, null, 2),
      },
    ]);

    const result = await originalMethod.apply(this, args);

    (this as AmplitudeCore<Config>).messageBus.emit(MeasurementStates.END, [
      {
        key: loggerKey,
        name: propertyKey,
        time: new Date().getTime(),
        config: JSON.stringify((this as AmplitudeCore<Config>).config, null, 2),
      },
    ]);

    return result;
  };

  Object.defineProperty(descriptor.value, 'name', {
    value: propertyKey,
    configurable: true,
  });

  return descriptor;
};

export class MessageBus {
  private callbacks = new Map<string | symbol, Set<MessageBusCallback>>();
  private coreCallbacks = new Set<MessageBusCallback>();

  subscribeAll(callback: MessageBusCallback) {
    this.coreCallbacks.add(callback);
    return () => this.coreCallbacks.delete(callback);
  }

  subscribeOnce(messageType: string | symbol, callback: MessageBusCallback) {
    const newCallback: MessageBusCallback = (state) => {
      callback(state);
      this.unsubscribe(messageType, newCallback);
    };
    return this.subscribe(messageType, newCallback);
  }

  subscribe(messageType: string | symbol, callback: MessageBusCallback) {
    if (!this.callbacks.has(messageType)) {
      this.callbacks.set(messageType, new Set<MessageBusCallback>());
    }
    const functionSet = this.callbacks.get(messageType) as Set<MessageBusCallback>;
    functionSet.add(callback);
    return () => this.unsubscribe(messageType, callback);
  }

  unsubscribe(messageType: string | symbol, callback: MessageBusCallback) {
    const functionSet = this.callbacks.get(messageType);
    functionSet?.delete(callback);
  }

  emit(messageType: string | symbol, args: any[]) {
    this.emitAll(messageType, args);
    const functionSet = this.callbacks.get(messageType) as Set<MessageBusCallback>;
    functionSet?.forEach((callback) => {
      callback({ messageType, args });
    });
  }

  private emitAll(messageType: string | symbol, args: any[]) {
    this.coreCallbacks.forEach((callback) => callback({ messageType, args }));
  }
}
