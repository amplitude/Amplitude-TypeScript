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
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  SUCCESS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../messages';
import { STORAGE_PREFIX } from '../constants';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';
import { serverUrls } from '../config';

export class Destination implements DestinationPlugin {
  name = 'amplitude';
  type = PluginType.DESTINATION as const;

  backoff = 30000;
  storageKey = '';
  backup: Set<Event> = new Set();
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
  scheduled = false;
  queue: Context[] = [];

  setup(config: Config) {
    this.config = config;

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    const unsent = this.config.storageProvider.get(this.storageKey);
    this.snapshot(); // sets storage to '[]'
    if (unsent && unsent.length > 0) {
      void Promise.all(unsent.map((event) => this.execute(event))).catch();
    }

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
    this.addToBackup(...list.map((context) => context.event));
    list.forEach((context) => (context.attempts += 1));
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
    if (!this.config.apiKey) {
      return this.fulfillRequest(list, 400, MISSING_API_KEY_MESSAGE);
    }

    const payload = {
      api_key: this.config.apiKey,
      events: list.map((context) => context.event),
    };

    try {
      const res = await this.config.transportProvider.send(this.getApiHost(), payload);
      if (res === null) {
        this.fulfillRequest(list, 0, UNEXPECTED_ERROR_MESSAGE);
        return;
      }
      this.handleReponse(res, list);
    } catch (e) {
      this.fulfillRequest(list, 0, String(e));
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
    this.fulfillRequest(list, res.statusCode, SUCCESS_MESSAGE);
  }

  handleInvalidResponse(res: InvalidResponse, list: Context[]) {
    if (res.body.missingField) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
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

    this.fulfillRequest(drop, res.statusCode, res.body.error);
    this.addToQueue(...retry);
  }

  handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]) {
    if (list.length === 1) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
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

    this.fulfillRequest(drop, res.statusCode, res.body.error);
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

    this.fulfillRequest(drop, res.statusCode, MAX_RETRIES_EXCEEDED_MESSAGE);
    this.addToQueue(...retry);
  }

  fulfillRequest(list: Context[], code: number, message: string) {
    this.removeFromBackup(...list.map((context) => context.event));
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }

  addToBackup(...events: Event[]) {
    if (!this.config.saveEvents) return;
    events.forEach((event) => this.backup.add(event));
    this.snapshot();
  }

  removeFromBackup(...events: Event[]) {
    if (!this.config.saveEvents) return;
    events.forEach((event) => this.backup.delete(event));
    this.snapshot();
  }

  snapshot() {
    if (!this.config.saveEvents) return;
    const events = Array.from(this.backup);
    this.config.storageProvider.set(this.storageKey, events);
  }

  getApiHost() {
    return this.config.serverUrl ? this.config.serverUrl : serverUrls[this.config.serverZone](this.config.useBatch);
  }
}
