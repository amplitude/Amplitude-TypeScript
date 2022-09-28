import { AmplitudeCore } from '../core-client';
import { Config, MessageBus as IMessageBus, MessageBusCallback } from '@amplitude/analytics-types';
import { UUID } from './uuid';
import { Logger } from '../logger';
import { getParamNames } from './get-param-names';
import { returnWrapper } from './return-wrapper';

export const MeasurementStates = {
  START: 'MeasurementStart',
  END: 'MeasurementEnd',
};

export const emitPublicApi = <T extends (...args: any[]) => unknown>(
  client: AmplitudeCore<Config>,
  fnName: string,
  fn: T,
) => {
  const publicApiFn = (...args: Parameters<T>) => {
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

    const result = fn.apply(client, args) as ReturnType<T>;

    if ((result as ReturnType<ReturnType<typeof returnWrapper>>)?.promise) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      (result as any).promise.then(() => {
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

export const emitInternalApi = <T extends (...args: any[]) => any>(
  _target: AmplitudeCore<Config>,
  propertyKey: string,
  descriptor: PropertyDescriptor,
) => {
  const originalMethod = descriptor.value as T;
  descriptor.value = async function (...args: Parameters<T>) {
    const scope = this as AmplitudeCore<Config>;
    const loggerKey = `InternalApi_${UUID()}`;
    Object.defineProperty(originalMethod, 'name', {
      value: loggerKey,
      configurable: true,
    });

    scope.messageBus.emit(MeasurementStates.START, [
      {
        key: loggerKey,
        name: propertyKey,
        callStacks: Logger.trace(),
        arguments: args,
        paramNames: getParamNames(originalMethod),
        time: new Date().getTime(),
        config: JSON.stringify(scope.config, null, 2),
      },
    ]);

    const result = (await originalMethod.apply(this, args)) as ReturnType<T>;

    scope.messageBus.emit(MeasurementStates.END, [
      {
        key: loggerKey,
        name: propertyKey,
        time: new Date().getTime(),
        config: JSON.stringify(scope.config, null, 2),
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

export class MessageBus implements IMessageBus {
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
