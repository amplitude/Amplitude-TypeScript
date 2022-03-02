import {
  Config,
  DestinationContext as Context,
  DestinationPlugin,
  Event,
  PluginType,
  Transport,
} from '@amplitude/analytics-types';
import { Result } from '../../src/result';
import {
  BaseError,
  InvalidRequestError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  TooManyRequestsForDeviceError,
  UnexpectedError,
} from '../response';

export class Destination implements DestinationPlugin {
  name: string;
  type = PluginType.DESTINATION as const;

  queue: Context[] = [];
  scheduled = false;

  transportProvider?: Transport;
  serverUrl = '';
  flushMaxRetries = 0;
  flushQueueSize = 0;
  flushIntervalMillis = 0;
  backoff = 30000;

  constructor(name: string) {
    this.name = name;
  }

  setup(config: Config) {
    this.transportProvider = config.transportProvider;
    this.serverUrl = config.serverUrl;
    this.flushMaxRetries = config.flushMaxRetries;
    this.flushQueueSize = config.flushQueueSize;
    this.flushIntervalMillis = config.flushIntervalMillis;
    return Promise.resolve(undefined);
  }

  execute(event: Event): Promise<Result> {
    return new Promise((resolve) => {
      const context = {
        event,
        attempts: 0,
        callback: (result: Result) => resolve(result),
      };
      this.addToQueue(context);
    });
  }

  addToQueue(...list: Context[]) {
    list.map((context) => (context.attempts += 1));
    this.queue = this.queue.concat(...list);
    this.schedule(this.flushIntervalMillis);
  }

  schedule(timeout: number) {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => {
      void this.flush().then(() => {
        this.scheduled = false;
        if (this.queue.length > 0) {
          this.schedule(timeout);
        }
      });
    }, timeout);
  }

  flush() {
    const list = this.queue.slice(0, this.flushQueueSize);
    this.queue = this.queue.slice(this.flushQueueSize);
    return this.send(list);
  }

  async send(list: Context[]) {
    const drop: Context[] = [];
    let result = new Result();

    try {
      if (!this.transportProvider) return;
      const result = await this.transportProvider.send(this.serverUrl, list);
      list.map((context) => context.callback(new Result(true, result.code, result.name)));
      return;
    } catch (error) {
      // unexpected error
      if (!(error instanceof BaseError)) {
        result = new Result(false, 0, String(error));
        drop.push(...list);
        return;
      }

      result = new Result(false, error.code, error.message);

      // error 400
      if (error instanceof InvalidRequestError) {
        const dropIndex = [
          ...Object.values(error.eventsWithInvalidFields),
          ...Object.values(error.eventsWithMissingFields),
        ].flat();
        const dropIndexSet = new Set(dropIndex);
        drop.push(...list.filter((_, index) => dropIndexSet.has(index)));
        this.addToQueue(...list.filter((_, index) => !dropIndexSet.has(index)));
      }

      // error 413
      if (error instanceof PayloadTooLargeError) {
        if (list.length === 1) {
          drop.push(list[0]);
        } else {
          this.flushQueueSize /= 2;
          this.addToQueue(...list);
        }
      }

      // error 429
      if (error instanceof TooManyRequestsForDeviceError) {
        const dropIndex = [...Object.values(error.throttledEvents)];
        const dropIndexSet = new Set(dropIndex);
        drop.push(...list.filter((_, index) => dropIndexSet.has(index)));
        const retry = list.filter((_, index) => !dropIndexSet.has(index));
        setTimeout(() => {
          this.addToQueue(...retry);
        }, this.backoff);
      }

      // error 5xx
      if (
        error instanceof ServerError ||
        error instanceof ServiceUnavailableError ||
        error instanceof UnexpectedError
      ) {
        drop.push(...list.filter((context) => context.attempts >= this.flushMaxRetries));
        this.addToQueue(...list.filter((context) => context.attempts < this.flushMaxRetries));
      }
    } finally {
      drop.map((context) => context.callback(result));
    }
  }
}
