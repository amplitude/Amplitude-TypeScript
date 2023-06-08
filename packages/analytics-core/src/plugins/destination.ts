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
  INVALID_API_KEY,
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  SUCCESS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../messages';
import { STORAGE_PREFIX } from '../constants';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';
import { createServerConfig } from '../config';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export class Destination implements DestinationPlugin {
  name = 'amplitude';
  type = PluginType.DESTINATION as const;

  retryTimeout = 1000;
  throttleTimeout = 30000;
  storageKey = '';
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  queue: Context[] = [];

  async setup(config: Config): Promise<undefined> {
    this.config = config;

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    const unsent = await this.config.storageProvider?.get(this.storageKey);
    this.saveEvents(); // sets storage to '[]'
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
        timeout: 0,
      };
      void this.addToQueue(context);
    });
  }

  addToQueue(...list: Context[]) {
    const tryable = list.filter((context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        context.attempts += 1;
        return true;
      }
      void this.fulfillRequest([context], 500, MAX_RETRIES_EXCEEDED_MESSAGE);
      return false;
    });

    tryable.forEach((context) => {
      this.queue = this.queue.concat(context);
      if (context.timeout === 0) {
        this.schedule(this.config.flushIntervalMillis);
        return;
      }

      setTimeout(() => {
        context.timeout = 0;
        this.schedule(0);
      }, context.timeout);
    });

    this.saveEvents();
  }

  schedule(timeout: number) {
    if (this.scheduled) return;
    this.scheduled = setTimeout(() => {
      void this.flush(true).then(() => {
        if (this.queue.length > 0) {
          this.schedule(timeout);
        }
      });
    }, timeout);
  }

  async flush(useRetry = false) {
    const list: Context[] = [];
    const later: Context[] = [];
    this.queue.forEach((context) => (context.timeout === 0 ? list.push(context) : later.push(context)));
    this.queue = later;

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    const batches = chunk(list, this.config.flushQueueSize);
    await Promise.all(batches.map((batch) => this.send(batch, useRetry)));
  }

  async send(list: Context[], useRetry = true) {
    if (!this.config.apiKey) {
      return this.fulfillRequest(list, 400, MISSING_API_KEY_MESSAGE);
    }

    const payload = {
      api_key: this.config.apiKey,
      events: list.map((context) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { extra, ...eventWithoutExtra } = context.event;
        return eventWithoutExtra;
      }),
      options: {
        min_id_length: this.config.minIdLength,
      },
    };

    try {
      const { serverUrl } = createServerConfig(this.config.serverUrl, this.config.serverZone, this.config.useBatch);
      const res = await this.config.transportProvider.send(serverUrl, payload);
      if (res === null) {
        this.fulfillRequest(list, 0, UNEXPECTED_ERROR_MESSAGE);
        return;
      }
      if (!useRetry) {
        if ('body' in res) {
          let responseBody = '';
          try {
            responseBody = JSON.stringify(res.body, null, 2);
          } catch {
            // to avoid crash, but don't care about the error, add comment to avoid empty block lint error
          }
          this.fulfillRequest(list, res.statusCode, `${res.status}: ${responseBody}`);
        } else {
          this.fulfillRequest(list, res.statusCode, res.status);
        }
        return;
      }
      this.handleResponse(res, list);
    } catch (e) {
      this.config.loggerProvider.error(getErrorMessage(e));
      this.fulfillRequest(list, 0, String(e));
    }
  }

  handleResponse(res: Response, list: Context[]) {
    const { status } = res;
    let responseBodyString;
    try {
      responseBodyString =
        'body' in res ? JSON.stringify({ code: res.statusCode, ...res.body }) : { code: res.statusCode };
    } catch {
      // to avoid crash, but don't care about the error, add comment to avoid empty block lint error
    }

    switch (status) {
      case Status.Success: {
        this.config.loggerProvider.log(responseBodyString);
        this.handleSuccessResponse(res, list);
        break;
      }
      case Status.Invalid: {
        this.config.loggerProvider.warn(responseBodyString);
        this.handleInvalidResponse(res, list);
        break;
      }
      case Status.PayloadTooLarge: {
        this.config.loggerProvider.warn(responseBodyString);
        this.handlePayloadTooLargeResponse(res, list);
        break;
      }
      case Status.RateLimit: {
        this.config.loggerProvider.warn(responseBodyString);
        this.handleRateLimitResponse(res, list);
        break;
      }
      default: {
        this.config.loggerProvider.warn(`{code: 0, error: "Status '${status}' provided for ${list.length} events"}`);
        this.handleOtherResponse(list);
        break;
      }
    }
  }

  handleSuccessResponse(res: SuccessResponse, list: Context[]) {
    this.fulfillRequest(list, res.statusCode, SUCCESS_MESSAGE);
  }

  handleInvalidResponse(res: InvalidResponse, list: Context[]) {
    if (res.body.missingField || res.body.error.startsWith(INVALID_API_KEY)) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
      return;
    }

    const dropIndex = [
      ...Object.values(res.body.eventsWithInvalidFields),
      ...Object.values(res.body.eventsWithMissingFields),
      ...Object.values(res.body.eventsWithInvalidIdLengths),
      ...res.body.silencedEvents,
    ].flat();
    const dropIndexSet = new Set(dropIndex);

    const retry = list.filter((context, index) => {
      if (dropIndexSet.has(index)) {
        this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      return true;
    });

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

    const retry = list.filter((context, index) => {
      if (
        (context.event.user_id && dropUserIdsSet.has(context.event.user_id)) ||
        (context.event.device_id && dropDeviceIdsSet.has(context.event.device_id))
      ) {
        this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      if (throttledIndexSet.has(index)) {
        context.timeout = this.throttleTimeout;
      }
      return true;
    });

    this.addToQueue(...retry);
  }

  handleOtherResponse(list: Context[]) {
    this.addToQueue(
      ...list.map((context) => {
        context.timeout = context.attempts * this.retryTimeout;
        return context;
      }),
    );
  }

  fulfillRequest(list: Context[], code: number, message: string) {
    this.saveEvents();
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }

  /**
   * Saves events to storage
   * This is called on
   * 1) new events are added to queue; or
   * 2) response comes back for a request
   */
  saveEvents() {
    if (!this.config.storageProvider) {
      return;
    }
    const events = Array.from(this.queue.map((context) => context.event));
    void this.config.storageProvider.set(this.storageKey, events);
  }
}
