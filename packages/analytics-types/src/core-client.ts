import { BaseEvent, EventOptions } from './base-event';
import { Config } from './config';
import { Result } from './result';

export interface CoreClient<T extends Config> {
  config: T;
  track(
    eventInput: BaseEvent | string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): Promise<Result>;
}
