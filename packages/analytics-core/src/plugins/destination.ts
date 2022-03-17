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
} from '@amplitude/analytics-types';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';

export class Destination implements DestinationPlugin {
  name = 'amplitude';
  type = PluginType.DESTINATION as const;

  backoff = 30000;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
  scheduled = false;
  queue: Context[] = [];

  setup(config: Config) {
    this.config = config;
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
    this.schedule(this.config.flushIntervalMillis);
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
    const batches = chunk(list, this.config.flushQueueSize);
    await Promise.all(batches.map((batch) => this.send(batch)));
  }

  async send(list: Context[]) {
    const payload = {
      api_key: this.config.apiKey,
      events: list.map((context) => context.event),
    };

    try {
      const res = await this.config.transportProvider.send(this.config.serverUrl, payload);
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
    this.config.flushQueueSize /= 2;
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
        curr.attempts > this.config.flushMaxRetries ? drop.push(curr) : retry.push(curr);
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
