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
import { buildResult } from '../utils/result-builder';
import { createServerConfig } from '../config';
import { UUID } from '../utils/uuid';
import { chunk } from '../utils/chunk';

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

  storageKey = '';
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: Config;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  queue: Context[] = [];
  shouldThrottled = false;
  throttleTimeout = 3000;

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
    // Assign insert_id for dropping invalid event later
    if (!event.insert_id) {
      event.insert_id = UUID();
    }

    return new Promise((resolve) => {
      const context = {
        event,
        attempts: 0,
        callback: (result: Result) => resolve(result),
      };
      void this.addToQueue(context);
    });
  }

  addToQueue(...list: Context[]) {
    this.queue = this.queue.concat(list);
    this.saveEvents();
    this.sendEventsIfReady();
  }

  filterTriableList() {
    this.queue = this.queue.filter((context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        return true;
      }
      void this.fulfillRequest([context], 500, MAX_RETRIES_EXCEEDED_MESSAGE);
      return false;
    });
  }

  increaseAttempts(list: Context[]) {
    const updateEventSet = new Set(list.map((context) => context.event.insert_id));
    this.queue.forEach((context) => {
      if (updateEventSet.has(context.event.insert_id)) {
        context.attempts += 1;
      }
    });
  }

  sendEventsIfReady() {
    console.log('sendEventsIfReady');
    if (this.config.offline) {
      return;
    }

    console.log(this.shouldThrottled);

    if (this.shouldThrottled) {
      return;
    }

    if (this.queue.length >= this.config.flushQueueSize) {
      console.log('in size flush');
      void this.flush(true);
    }

    console.log(this.scheduled);
    if (this.scheduled) {
      return;
    }
    console.log('before set timer');
    this.scheduled = setTimeout(() => {
      console.log('in schedule timeout');
      void this.flush(true).then(() => {
        if (this.queue.length > 0) {
          console.log('in flush try to sendEventsIfReady');
          this.sendEventsIfReady();
        }
      });
    }, this.config.flushIntervalMillis);

    return;
  }

  // flush the queue
  async flush(useRetry = false) {
    console.log('flush');
    // Skip flush if offline
    if (this.config.offline) {
      this.config.loggerProvider.debug('Skipping flush while offline.');
      return;
    }

    if (this.shouldThrottled) {
      return;
    }

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    this.filterTriableList();
    if (this.queue.length === 0) {
      return;
    }

    const batches = chunk(this.queue, this.config.flushQueueSize);
    for (const batch of batches) {
      console.log(1);
      this.increaseAttempts(batch);
      const isFullfilledRequest = await this.send(batch, useRetry);
      console.log(isFullfilledRequest);
      // To keep the order of events sending to the backend, stop sending the other requests while the request is not been fullfilled.
      // All the events are still queued, and will be retried with next trigger.
      if (!isFullfilledRequest) {
        break;
      }
    }
  }

  /**
   * Send the events to the server
   *
   * @returns if the request has been fullfilled.
   */
  async send(list: Context[], useRetry = true): Promise<boolean> {
    if (!this.config.apiKey) {
      this.fulfillRequest(list, 400, MISSING_API_KEY_MESSAGE);
      return true;
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
        return true;
      }

      if (!useRetry) {
        if ('body' in res) {
          this.fulfillRequest(list, res.statusCode, `${res.status}: ${getResponseBodyString(res)}`);
        } else {
          this.fulfillRequest(list, res.statusCode, res.status);
        }
        return true;
      }

      return this.handleResponse(res, list);
    } catch (e) {
      const errorMessage = getErrorMessage(e);
      this.config.loggerProvider.error(errorMessage);
      return this.handleResponse({ status: Status.Failed, statusCode: 0 }, list);
    }
  }

  handleResponse(res: Response, list: Context[]): boolean {
    const { status } = res;
    let isFullfilledRequest = false;
    switch (status) {
      case Status.Success: {
        isFullfilledRequest = this.handleSuccessResponse(res, list);
        break;
      }
      case Status.Invalid: {
        isFullfilledRequest = this.handleInvalidResponse(res, list);
        break;
      }
      case Status.PayloadTooLarge: {
        isFullfilledRequest = this.handlePayloadTooLargeResponse(res, list);
        break;
      }
      case Status.RateLimit: {
        isFullfilledRequest = this.handleRateLimitResponse(res, list);
        break;
      }
      default: {
        // log intermediate event status before retry
        this.config.loggerProvider.warn(`{code: 0, error: "Status '${status}' provided for ${list.length} events"}`);
        break;
      }
    }
    return isFullfilledRequest;
  }

  handleSuccessResponse(res: SuccessResponse, list: Context[]): boolean {
    this.fulfillRequest(list, res.statusCode, SUCCESS_MESSAGE);
    return true;
  }

  handleInvalidResponse(res: InvalidResponse, list: Context[]): boolean {
    if (res.body.missingField || res.body.error.startsWith(INVALID_API_KEY)) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
      return true;
    }

    const dropIndex = [
      ...Object.values(res.body.eventsWithInvalidFields),
      ...Object.values(res.body.eventsWithMissingFields),
      ...Object.values(res.body.eventsWithInvalidIdLengths),
      ...res.body.silencedEvents,
    ].flat();
    const dropIndexSet = new Set(dropIndex);

    // All the events are still queued, and will be retried with next trigger
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
      return false;
    }
    return true;
  }

  handlePayloadTooLargeResponse(res: PayloadTooLargeResponse, list: Context[]): boolean {
    if (list.length === 1) {
      this.fulfillRequest(list, res.statusCode, res.body.error);
      return true;
    }

    // log intermediate event status before retry
    this.config.loggerProvider.warn(getResponseBodyString(res));

    this.config.flushQueueSize /= 2;
    // All the events are still queued, and will be retried with next trigger
    return false;
  }

  handleRateLimitResponse(res: RateLimitResponse, list: Context[]): boolean {
    console.log('in handleRateLimitResponse');
    console.log(res.body);
    const dropUserIds = Object.keys(res.body.exceededDailyQuotaUsers);
    const dropDeviceIds = Object.keys(res.body.exceededDailyQuotaDevices);
    // Array of indexes in the events array indicating events whose user_id or device_id were throttled.
    const throttledIndexSet = new Set(res.body.throttledEvents);
    const dropUserIdsSet = new Set(dropUserIds);
    const dropDeviceIdsSet = new Set(dropDeviceIds);
    console.log(throttledIndexSet);
    console.log(list);
    const retry = list.filter((context, index) => {
      if (
        (context.event.user_id && dropUserIdsSet.has(context.event.user_id)) ||
        (context.event.device_id && dropDeviceIdsSet.has(context.event.device_id))
      ) {
        console.log(index);
        throttledIndexSet.delete(index);
        this.fulfillRequest([context], res.statusCode, res.body.error);
        return;
      }

      return true;
    });
    console.log(retry);

    if (retry.length > 0) {
      // log intermediate event status before retry
      this.config.loggerProvider.warn(getResponseBodyString(res));

      // Has throttled event and dot dropped before
      if (throttledIndexSet.size > 0) {
        console.log('set up shouldThrottled status');
        this.shouldThrottled = true;
        console.log('has been throttled');
        setTimeout(() => {
          this.shouldThrottled = false;
          console.log('clean throttled status');
        }, this.throttleTimeout);
      }

      return false;
    }

    return true;
    // All the events are still queued, and will be retried with next trigger
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
