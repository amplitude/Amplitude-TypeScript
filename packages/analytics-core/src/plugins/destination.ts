import {
  Config,
  DestinationContext as Context,
  DestinationPlugin,
  Event,
  InvalidResponse,
  PayloadTooLargeResponse,
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

export function getResponseBodyString(res: Response) {
  let responseBodyString = '';
  try {
    if ('body' in res) {
      responseBodyString = JSON.stringify(res.body, null, 2);
    }
  } catch {
    // to avoid crash, but don't care about the error, add comment to avoid empty block lint error
  }
  return responseBodyString;
}

export class Destination implements DestinationPlugin {
  name = 'amplitude';
  type = 'destination' as const;

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
    const dropEventSet = new Set<string>();
    const tryable = list.filter((context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        context.attempts += 1;

        return true;
      }
      //Remove the events more than max retries from the storage.
      dropEventSet.add(context.event.event_type);
      void this.fulfillRequest([context], 500, MAX_RETRIES_EXCEEDED_MESSAGE);
      return false;
    });
    void this.updateEvent(dropEventSet);

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
  }

  schedule(timeout: number) {
    if (this.scheduled || this.config.offline) {
      return;
    }

    this.scheduled = setTimeout(() => {
      void this.flush(true).then(() => {
        if (this.queue.length > 0) {
          this.schedule(timeout);
        }
      });
    }, timeout);
  }

  async flush(useRetry = false) {
    // Skip flush if offline
    if (this.config.offline) {
      this.config.loggerProvider.debug('Skipping flush while offline.');
      return;
    }

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
      client_upload_time: new Date().toISOString(),
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
          this.fulfillRequest(list, res.statusCode, `${res.status}: ${getResponseBodyString(res)}`);
        } else {
          this.fulfillRequest(list, res.statusCode, res.status);
        }
        return;
      }
      this.handleResponse(res, list);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      this.config.loggerProvider.error(errorMessage);
      this.fulfillRequest(list, 0, errorMessage);
    }
  }

  handleResponse(res: Response, list: Context[]) {
    const { status } = res;

    switch (status) {
      case Status.Success: {
        void this.handleSuccessResponse(res, list);
        break;
      }
      case Status.Invalid: {
        void this.handleInvalidResponse(res, list);
        break;
      }
      case Status.PayloadTooLarge: {
        void this.handlePayloadTooLargeResponse(res, list);
        break;
      }
      case Status.RateLimit: {
        void this.handleRateLimitResponse(res, list);
        break;
      }
      default: {
        // log intermediate event status before retry
        this.config.loggerProvider.warn(`{code: 0, error: "Status '${status}' provided for ${list.length} events"}`);

        this.handleOtherResponse(list);
        break;
      }
    }
  }

  handleSuccessResponse(res: SuccessResponse, list: Context[]) {
    this.fulfillRequest(list, res.statusCode, SUCCESS_MESSAGE);
    const dropEventSet = list.reduce(function (filtered, context) {
      filtered.add(context.event.event_type);
      return filtered;
    }, new Set<string>());

    void this.updateEvent(dropEventSet);
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
    const dropEventSet = new Set<string>();

    const retry = list.filter((context, index) => {
      if (dropIndexSet.has(index)) {
        dropEventSet.add(context.event.event_type);
        this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      return true;
    });

    if (retry.length > 0) {
      // log intermediate event status before retry
      this.config.loggerProvider.warn(getResponseBodyString(res));
    }

    void this.updateEvent(dropEventSet);
    this.addToQueue(...retry);
  }

  handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]) {
    if (list.length === 1) {
      void this.updateEvent(new Set(list[0].event.event_type));
      this.fulfillRequest(list, res.statusCode, res.body.error);
      return;
    }

    // log intermediate event status before retry
    this.config.loggerProvider.warn(getResponseBodyString(res));

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
    const dropEventSet = new Set<string>();

    const retry = list.filter((context, index) => {
      if (
        (context.event.user_id && dropUserIdsSet.has(context.event.user_id)) ||
        (context.event.device_id && dropDeviceIdsSet.has(context.event.device_id))
      ) {
        dropEventSet.add(context.event.event_type);
        this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }
      if (throttledIndexSet.has(index)) {
        context.timeout = this.throttleTimeout;
      }
      return true;
    });

    if (retry.length > 0) {
      // log intermediate event status before retry
      this.config.loggerProvider.warn(getResponseBodyString(res));
    }

    void this.updateEvent(dropEventSet);
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
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }

  /**
   * update the event storage
   */
  async updateEvent(dropEventSet: Set<string>) {
    if (!this.config.storageProvider) {
      return;
    }
    const savedEvent = await this.config.storageProvider.get(this.storageKey);
    const reTriedEvents: Event[] = [];
    if (savedEvent) {
      savedEvent.filter((event) => {
        if (!dropEventSet.has(event.event_type)) {
          reTriedEvents.push(event);
        }
      });
    }
    void this.config.storageProvider.set(this.storageKey, reTriedEvents);
  }
}
