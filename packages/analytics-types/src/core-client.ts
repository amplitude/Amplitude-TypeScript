import { BaseEvent, EventOptions } from './base-event';
import { Config } from './config';
import { MessageBus } from './message-bus';
import { Result } from './result';

export interface CoreClient<T extends Config> {
  config: T;
  messageBus: MessageBus;
  track(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): Promise<Result>;
}
