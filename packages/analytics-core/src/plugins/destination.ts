import {
  Config,
  DestinationContext as Context,
  DestinationPlugin,
  Event,
  PluginType,
  Result,
  Status,
  Transport,
} from '@amplitude/analytics-types';
import { buildResult } from '../../src/utils/result-builder';

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
    let dropQueue: Context[] = list;
    let retryQueue: Context[] = [];

    if (!this.transportProvider) return;

    const response = await this.transportProvider.send(this.serverUrl, list);

    if (response === null) {
      dropQueue.map((context) => context.callback(buildResult(0, Status.Unknown)));
      return;
    }

    const { status, statusCode } = response;

    if (status === Status.Success) {
      list.map((context) => context.callback(buildResult(statusCode, status)));
      return;
    }

    // error 400
    if (status === Status.Invalid) {
      const dropIndex = [
        ...Object.values(response.body.eventsWithInvalidFields),
        ...Object.values(response.body.eventsWithMissingFields),
      ].flat();
      const dropIndexSet = new Set(dropIndex);

      dropQueue = list.filter((_, index) => dropIndexSet.has(index));
      retryQueue = list.filter((_, index) => !dropIndexSet.has(index));
    }

    // error 413
    if (status === Status.PayloadTooLarge) {
      if (list.length === 1) {
        dropQueue = list;
      } else {
        this.flushQueueSize /= 2;
        dropQueue = [];
        retryQueue = list;
      }
    }

    // error 429
    if (status === Status.RateLimit) {
      const dropIndex = [...Object.values(response.body.throttledEvents)];
      const dropIndexSet = new Set(dropIndex);
      dropQueue = list.filter((_, index) => dropIndexSet.has(index));
      const retry = list.filter((_, index) => !dropIndexSet.has(index));
      setTimeout(() => {
        this.addToQueue(...retry);
      }, this.backoff);
    }

    // error 5xx
    if (status === Status.Failed) {
      dropQueue = list.filter((context) => context.attempts >= this.flushMaxRetries);
      retryQueue = list.filter((context) => context.attempts < this.flushMaxRetries);
    }

    dropQueue.map((context) => context.callback(buildResult(statusCode, status)));
    this.addToQueue(...retryQueue);
  }
}
