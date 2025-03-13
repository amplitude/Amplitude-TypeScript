import { DestinationPlugin } from '../types/plugin';
import { Event } from '../types/event/event';
import { Result } from '../types/result';
import { Status } from '../types/status';
import {
  Response,
  InvalidResponse,
  PayloadTooLargeResponse,
  RateLimitResponse,
  SuccessResponse,
} from '../types/response';
import {
  INVALID_API_KEY,
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  SUCCESS_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../types/messages';
import { STORAGE_PREFIX } from '../types/constants';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';
import { createServerConfig, RequestMetadata } from '../config';
import { UUID } from '../utils/uuid';
import { IConfig } from '../config';
import { EventCallback } from '../types/event-callback';

export interface Context {
  event: Event;
  attempts: number;
  callback: EventCallback;
  timeout: number;
}

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
  config: IConfig;
  // Indicator of whether events that are scheduled (but not flushed yet).
  // When flush:
  //   1. assign `scheduleId` to `flushId`
  //   2. set `scheduleId` to null
  scheduleId: ReturnType<typeof setTimeout> | null = null;
  // Timeout in milliseconds of current schedule
  scheduledTimeout = 0;
  // Indicator of whether current flush resolves.
  // When flush resolves, set `flushId` to null
  flushId: ReturnType<typeof setTimeout> | null = null;
  queue: Context[] = [];

  async setup(config: IConfig): Promise<undefined> {
    this.config = config;

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    const unsent = await this.config.storageProvider?.get(this.storageKey);
    if (unsent && unsent.length > 0) {
      void Promise.all(unsent.map((event) => this.execute(event))).catch();
    }

    return Promise.resolve(undefined);
  }

  execute(event: Event): Promise<Result> {
    // Assign insert_id for dropping invalid event later
    if (!event.insert_id) {
      event.insert_id = UUID();
    }

    return new Promise((resolve) => {
      const context = {
        event,
        attempts: 0,
        callback: (result: Result) => resolve(result),
        timeout: 0,
      };
      this.queue.push(context);
      this.schedule(this.config.flushIntervalMillis);
      this.saveEvents();
    });
  }

  removeEventsExceedFlushMaxRetries(list: Context[]) {
    return list.filter((context) => {
      context.attempts += 1;
      if (context.attempts < this.config.flushMaxRetries) {
        return true;
      }
      void this.fulfillRequest([context], 500, MAX_RETRIES_EXCEEDED_MESSAGE);
      return false;
    });
  }

  scheduleEvents(list: Context[]) {
    list.forEach((context) => {
      this.schedule(context.timeout === 0 ? this.config.flushIntervalMillis : context.timeout);
    });
  }

  // Schedule a flush in timeout when
  // 1. No schedule
  // 2. Timeout greater than existing timeout.
  // This makes sure that when throttled, no flush when throttle timeout expires.
  schedule(timeout: number) {
    if (this.config.offline) {
      return;
    }

    if (this.scheduleId === null || (this.scheduleId && timeout > this.scheduledTimeout)) {
      if (this.scheduleId) {
        clearTimeout(this.scheduleId);
      }
      this.scheduledTimeout = timeout;
      this.scheduleId = setTimeout(() => {
        this.queue = this.queue.map((context) => {
          context.timeout = 0;
          return context;
        });
        void this.flush(true);
      }, timeout);
      return;
    }
  }

  // Mark current schedule is flushed.
  resetSchedule() {
    this.scheduleId = null;
    this.scheduledTimeout = 0;
  }

  // Flush all events regardless of their timeout
  async flush(useRetry = false) {
    // Skip flush if offline
    if (this.config.offline) {
      this.resetSchedule();
      this.config.loggerProvider.debug('Skipping flush while offline.');
      return;
    }

    if (this.flushId) {
      this.resetSchedule();
      this.config.loggerProvider.debug('Skipping flush because previous flush has not resolved.');
      return;
    }

    this.flushId = this.scheduleId;
    this.resetSchedule();

    const list: Context[] = [];
    const later: Context[] = [];
    this.queue.forEach((context) => (context.timeout === 0 ? list.push(context) : later.push(context)));

    const batches = chunk(list, this.config.flushQueueSize);

    // Promise.all() doesn't guarantee resolve order.
    // Sequentially resolve to make sure backend receives events in order
    await batches.reduce(async (promise, batch) => {
      await promise;
      return await this.send(batch, useRetry);
    }, Promise.resolve());

    // Mark current flush is done
    this.flushId = null;

    this.scheduleEvents(this.queue);
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
      request_metadata: this.config.requestMetadata,
    };
    this.config.requestMetadata = new RequestMetadata();

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
      this.handleResponse({ status: Status.Failed, statusCode: 0 }, list);
    }
  }

  handleResponse(res: Response, list: Context[]) {
    const { status } = res;

    switch (status) {
      case Status.Success: {
        this.handleSuccessResponse(res, list);
        break;
      }
      case Status.Invalid: {
        this.handleInvalidResponse(res, list);
        break;
      }
      case Status.PayloadTooLarge: {
        this.handlePayloadTooLargeResponse(res, list);
        break;
      }
      case Status.RateLimit: {
        this.handleRateLimitResponse(res, list);
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

    if (retry.length > 0) {
      // log intermediate event status before retry
      this.config.loggerProvider.warn(getResponseBodyString(res));
    }

    const tryable = this.removeEventsExceedFlushMaxRetries(retry);
    this.scheduleEvents(tryable);
  }

  handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]) {
    if (list.length === 1) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
      return;
    }

    // log intermediate event status before retry
    this.config.loggerProvider.warn(getResponseBodyString(res));

    this.config.flushQueueSize /= 2;

    const tryable = this.removeEventsExceedFlushMaxRetries(list);
    this.scheduleEvents(tryable);
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

    if (retry.length > 0) {
      // log intermediate event status before retry
      this.config.loggerProvider.warn(getResponseBodyString(res));
    }

    const tryable = this.removeEventsExceedFlushMaxRetries(retry);
    this.scheduleEvents(tryable);
  }

  handleOtherResponse(list: Context[]) {
    const later = list.map((context) => {
      context.timeout = context.attempts * this.retryTimeout;
      return context;
    });

    const tryable = this.removeEventsExceedFlushMaxRetries(later);
    this.scheduleEvents(tryable);
  }

  fulfillRequest(list: Context[], code: number, message: string) {
    this.removeEvents(list);
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }

  /**
   * This is called on
   * 1) new events are added to queue; or
   * 2) response comes back for a request
   *
   * Update the event storage based on the queue
   */
  saveEvents() {
    if (!this.config.storageProvider) {
      return;
    }

    const updatedEvents = this.queue.map((context) => context.event);
    void this.config.storageProvider.set(this.storageKey, updatedEvents);
  }

  /**
   * This is called on response comes back for a request
   */
  removeEvents(eventsToRemove: Context[]) {
    this.queue = this.queue.filter(
      (queuedContext) => !eventsToRemove.some((context) => context.event.insert_id === queuedContext.event.insert_id),
    );

    this.saveEvents();
  }
}
