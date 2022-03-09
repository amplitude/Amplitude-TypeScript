import {
  Config,
  DestinationContext as Context,
  DestinationPlugin,
  Event,
  InvalidResponse,
  PayloadTooLargeResponse,
  PluginType,
  RateLimitResponse,
  Response,
  Result,
  Status,
  SuccessResponse,
  Transport,
} from '@amplitude/analytics-types';
import { chunk } from '../../src/utils/chunk';
import { buildResult } from '../../src/utils/result-builder';

export class Destination implements DestinationPlugin {
  name: string;
  type = PluginType.DESTINATION as const;

  queue: Context[] = [];
  scheduled = false;

  apiKey = '';
  backoff = 30000;
  flushMaxRetries = 0;
  flushQueueSize = 0;
  flushIntervalMillis = 0;
  serverUrl = '';
  transportProvider?: Transport;

  constructor(name: string) {
    this.name = name;
  }

  setup(config: Config) {
    this.apiKey = config.apiKey;
    this.flushMaxRetries = config.flushMaxRetries;
    this.flushQueueSize = config.flushQueueSize;
    this.flushIntervalMillis = config.flushIntervalMillis;
    this.serverUrl = config.serverUrl;
    this.transportProvider = config.transportProvider;
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

  async flush() {
    const list = this.queue;
    this.queue = [];
    const batches = chunk(list, this.flushQueueSize);
    await Promise.all(batches.map((batch) => this.send(batch)));
  }

  async send(list: Context[]) {
    if (!this.transportProvider) return;
    const payload = {
      api_key: this.apiKey,
      events: list.map((context) => context.event),
    };

    try {
      const res = await this.transportProvider.send(this.serverUrl, payload);
      if (res === null) {
        this.fulfillRequest(list, 0, Status.Unknown);
        return;
      }
      this.handleReponse(res, list);
    } catch (e) {
      this.fulfillRequest(list, 0, Status.Failed);
    }
  }

  handleReponse(res: Response, list: Context[]) {
    const { status } = res;
    switch (status) {
      case Status.Success:
        this.handleSuccessResponse(res, list);
        break;

      case Status.Invalid:
        this.handleInvalidResponse(res, list);
        break;

      case Status.PayloadTooLarge:
        this.handlePayloadTooLargeResponse(res, list);
        break;

      case Status.RateLimit:
        this.handleRateLimitResponse(res, list);
        break;

      default:
        this.handleOtherReponse(res, list);
    }
  }

  handleSuccessResponse(res: SuccessResponse, list: Context[]) {
    this.fulfillRequest(list, res.statusCode, res.status);
  }

  handleInvalidResponse(res: InvalidResponse, list: Context[]) {
    if (res.body.missingField) {
      this.fulfillRequest(list, res.statusCode, res.status);
      return;
    }

    const dropIndex = [
      ...Object.values(res.body.eventsWithInvalidFields),
      ...Object.values(res.body.eventsWithMissingFields),
      ...res.body.silencedEvents,
    ].flat();
    const dropIndexSet = new Set(dropIndex);

    const [drop, retry] = list.reduce<[Context[], Context[]]>(
      ([drop, retry], curr, index) => {
        dropIndexSet.has(index) ? drop.push(curr) : retry.push(curr);
        return [drop, retry];
      },
      [[], []],
    );

    this.fulfillRequest(drop, res.statusCode, res.status);
    this.addToQueue(...retry);
  }

  handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]) {
    if (list.length === 1) {
      this.fulfillRequest(list, res.statusCode, res.status);
      return;
    }
    this.flushQueueSize /= 2;
    this.addToQueue(...list);
  }

  handleRateLimitResponse(res: RateLimitResponse, list: Context[]) {
    const dropUserIds = Object.keys(res.body.exceededDailyQuotaUsers);
    const dropDeviceIds = Object.keys(res.body.exceededDailyQuotaDevices);
    const throttledIndex = res.body.throttledEvents;
    const dropUserIdsSet = new Set(dropUserIds);
    const dropDeviceIdsSet = new Set(dropDeviceIds);
    const throttledIndexSet = new Set(throttledIndex);

    const [drop, retryNow, retryLater] = list.reduce<[Context[], Context[], Context[]]>(
      ([drop, retryNow, retryLater], curr, index) => {
        if (
          (curr.event.user_id && dropUserIdsSet.has(curr.event.user_id)) ||
          (curr.event.device_id && dropDeviceIdsSet.has(curr.event.device_id))
        ) {
          drop.push(curr);
        } else if (throttledIndexSet.has(index)) {
          retryLater.push(curr);
        } else {
          retryNow.push(curr);
        }
        return [drop, retryNow, retryLater];
      },
      [[], [], []],
    );

    this.fulfillRequest(drop, res.statusCode, res.status);
    this.addToQueue(...retryNow);
    setTimeout(() => {
      this.addToQueue(...retryLater);
    }, this.backoff);
  }

  handleOtherReponse(res: Response, list: Context[]) {
    const [drop, retry] = list.reduce<[Context[], Context[]]>(
      ([drop, retry], curr) => {
        curr.attempts > this.flushMaxRetries ? drop.push(curr) : retry.push(curr);
        return [drop, retry];
      },
      [[], []],
    );

    this.fulfillRequest(drop, res.statusCode, res.status);
    this.addToQueue(...retry);
  }

  fulfillRequest(list: Context[], statusCode: number, status: Status) {
    list.forEach((context) => context.callback(buildResult(statusCode, status)));
  }
}
