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
import { MISSING_API_KEY_MESSAGE, SUCCESS_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from '../messages';
import { STORAGE_PREFIX } from '../constants';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';
import { createServerConfig } from '../config';

export class Destination implements DestinationPlugin {
  name = 'amplitude';
  type = PluginType.DESTINATION as const;

  backoff = 1000;
  throttle = 30000;
  storageKey = '';
  backup: Set<Event> = new Set();
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
  scheduled = false;
  queue: Context[] = [];
  queueBuffer: Set<Context> = new Set();

  async setup(config: Config): Promise<undefined> {
    this.config = config;

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    const unsent = await this.config.storageProvider.get(this.storageKey);
    await this.snapshot(); // sets storage to '[]'
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
        delay: 0,
      };
      void this.addToQueue(context);
    });
  }

  async addToQueue(...list: Context[]): Promise<void> {
    const tryable = list.filter(async (context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        return true;
      }
      await this.fulfillRequest([context], 500, Status.Unknown);
      return false;
    });

    await this.addToBackup(...tryable.map((context) => context.event));
    tryable.forEach((context) => {
      context.attempts += 1;
      const delay = context.delay;
      context.delay = 0;
      if (context.attempts === 1 && !context.delay) {
        this.queue = this.queue.concat(context);
        this.schedule(this.config.flushIntervalMillis);
        return;
      }
      this.queueBuffer.add(context);
      setTimeout(() => {
        if (this.queueBuffer.has(context)) {
          this.queueBuffer.delete(context);
          this.queue = this.queue.concat(context);
          this.schedule(this.config.flushIntervalMillis);
        }
      }, delay || context.attempts * this.backoff);
    });
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

  async flush(includeQueueBuffer = false) {
    const list = this.queue;
    this.queue = [];

    if (includeQueueBuffer) {
      list.push(...this.queueBuffer.values());
      this.queueBuffer.clear();
    }
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
      options: {
        min_id_length: this.config.minIdLength,
      },
    };

    try {
      const { serverUrl } = createServerConfig(this.config.serverUrl, this.config.serverZone, this.config.useBatch);
      const res = await this.config.transportProvider.send(serverUrl, payload);
      if (res === null) {
        await this.fulfillRequest(list, 0, UNEXPECTED_ERROR_MESSAGE);
        return;
      }
      await this.handleReponse(res, list);
    } catch (e) {
      await this.fulfillRequest(list, 0, String(e));
    }
  }

  async handleReponse(res: Response, list: Context[]): Promise<void> {
    const { status } = res;
    switch (status) {
      case Status.Success:
        await this.handleSuccessResponse(res, list);
        break;

      case Status.Invalid:
        await this.handleInvalidResponse(res, list);
        break;

      case Status.PayloadTooLarge:
        await this.handlePayloadTooLargeResponse(res, list);
        break;

      case Status.RateLimit:
        await this.handleRateLimitResponse(res, list);
        break;

      default:
        await this.handleOtherReponse(list);
    }
  }

  async handleSuccessResponse(res: SuccessResponse, list: Context[]): Promise<void> {
    await this.fulfillRequest(list, res.statusCode, SUCCESS_MESSAGE);
  }

  async handleInvalidResponse(res: InvalidResponse, list: Context[]): Promise<void> {
    if (res.body.missingField) {
      await this.fulfillRequest(list, res.statusCode, res.body.error);
      return;
    }

    const dropIndex = [
      ...Object.values(res.body.eventsWithInvalidFields),
      ...Object.values(res.body.eventsWithMissingFields),
      ...Object.values(res.body.eventsWithInvalidIdLengths),
      ...res.body.silencedEvents,
    ].flat();
    const dropIndexSet = new Set(dropIndex);

    const retry = list.filter(async (context, index) => {
      if (dropIndexSet.has(index)) {
        await this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      return true;
    });

    await this.addToQueue(...retry);
  }

  async handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]): Promise<void> {
    if (list.length === 1) {
      await this.fulfillRequest(list, res.statusCode, res.body.error);
      return;
    }
    this.config.flushQueueSize /= 2;
    await this.addToQueue(...list);
  }

  async handleRateLimitResponse(res: RateLimitResponse, list: Context[]): Promise<void> {
    const dropUserIds = Object.keys(res.body.exceededDailyQuotaUsers);
    const dropDeviceIds = Object.keys(res.body.exceededDailyQuotaDevices);
    const throttledIndex = res.body.throttledEvents;
    const dropUserIdsSet = new Set(dropUserIds);
    const dropDeviceIdsSet = new Set(dropDeviceIds);
    const throttledIndexSet = new Set(throttledIndex);

    const retry = list.filter(async (context, index) => {
      if (
        (context.event.user_id && dropUserIdsSet.has(context.event.user_id)) ||
        (context.event.device_id && dropDeviceIdsSet.has(context.event.device_id))
      ) {
        await this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      if (throttledIndexSet.has(index)) {
        context.delay = this.throttle;
      }
      return true;
    });

    await this.addToQueue(...retry);
  }

  async handleOtherReponse(list: Context[]): Promise<void> {
    await this.addToQueue(...list);
  }

  async fulfillRequest(list: Context[], code: number, message: string): Promise<void> {
    await this.removeFromBackup(...list.map((context) => context.event));
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }

  async addToBackup(...events: Event[]): Promise<void> {
    if (!this.config.saveEvents) return;
    events.forEach((event) => this.backup.add(event));
    await this.snapshot();
  }

  async removeFromBackup(...events: Event[]): Promise<void> {
    if (!this.config.saveEvents) return;
    events.forEach((event) => this.backup.delete(event));
    await this.snapshot();
  }

  async snapshot(): Promise<void> {
    if (!this.config.saveEvents) return;
    const events = Array.from(this.backup);
    await this.config.storageProvider.set(this.storageKey, events);
  }
}
