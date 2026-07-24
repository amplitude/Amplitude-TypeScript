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
import {
  AMPLITUDE_BATCH_SERVER_URL,
  AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
  STORAGE_PREFIX,
} from '../types/constants';
import { chunk } from '../utils/chunk';
import { buildResult } from '../utils/result-builder';
import { createServerConfig, RequestMetadata } from '../config';
import { UUID } from '../utils/uuid';
import { IConfig } from '../types/config/core-config';
import { OfflineDisabled } from '../types/offline';
import { EventCallback } from '../types/event-callback';
import { IDiagnosticsClient } from '../diagnostics/diagnostics-client';
import { isSuccessStatusCode } from '../utils/status-code';
import { getStacktrace } from '../utils/debug';

export interface Context {
  event: Event;
  attempts: number;
  callback: EventCallback;
  timeout: number;
}

const DEFAULT_AMPLITUDE_SERVER_URLS = new Set([
  AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
  AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
]);

// Upper bound for the offline auto-recovery backoff, in milliseconds. Mirrors the
// mobile SDKs' MAX_RETRY_INTERVAL (60s) so a prolonged outage settles into a steady
// one-attempt-per-minute retry rather than backing off unboundedly.
export const MAX_OFFLINE_BACKOFF_INTERVAL = 60000;

const shouldCompressUploadBodyForRequest = (serverUrl: string, enableRequestBodyCompression = false) => {
  if (DEFAULT_AMPLITUDE_SERVER_URLS.has(serverUrl)) {
    return true;
  }

  return enableRequestBodyCompression;
};

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
  diagnosticsClient: IDiagnosticsClient | undefined;
  // Timer that brings the SDK back online after it went offline due to exhausting
  // the retry budget against an unreachable server. Null when no recovery is pending.
  offlineRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  // Consecutive offline auto-recovery attempts; drives the exponential backoff.
  // Reset to 0 on the first successful upload.
  offlineRetryAttempts = 0;

  constructor(context?: { diagnosticsClient: IDiagnosticsClient }) {
    this.diagnosticsClient = context?.diagnosticsClient;
  }

  async setup(config: IConfig): Promise<undefined> {
    this.config = config;

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    const unsent = await this.config.storageProvider?.get(this.storageKey);
    if (unsent && unsent.length > 0) {
      void Promise.all(unsent.map((event: Event) => this.execute(event))).catch();
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

  // Increment each event's attempt counter and split the list into events that
  // still have retries left (`tryable`) and events that have exhausted the budget
  // (`exceeded`). Callers decide what to do with the exceeded events (drop them, or
  // retain them and go offline).
  partitionByRetryBudget(list: Context[]): { tryable: Context[]; exceeded: Context[] } {
    const tryable: Context[] = [];
    const exceeded: Context[] = [];
    list.forEach((context) => {
      context.attempts += 1;
      if (context.attempts < this.config.flushMaxRetries) {
        tryable.push(context);
      } else {
        exceeded.push(context);
      }
    });
    return { tryable, exceeded };
  }

  removeEventsExceedFlushMaxRetries(list: Context[]) {
    const { tryable, exceeded } = this.partitionByRetryBudget(list);
    exceeded.forEach((context) => void this.fulfillRequest([context], 500, MAX_RETRIES_EXCEEDED_MESSAGE));
    return tryable;
  }

  // Whether the offline feature is active. When explicitly disabled (OfflineDisabled),
  // transient failures fall back to the legacy behavior of dropping events after the
  // retry budget is exhausted.
  isOfflineEnabled(): boolean {
    return this.config.offline !== OfflineDisabled;
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
      const shouldCompressUploadBody = shouldCompressUploadBodyForRequest(
        serverUrl,
        this.config.enableRequestBodyCompression,
      );
      const res = await this.config.transportProvider.send(serverUrl, payload, shouldCompressUploadBody);
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

      this.diagnosticsClient?.recordEvent('analytics.events.unsuccessful.from.catch.error', {
        events: list.map((context) => context.event.event_type),
        message: errorMessage,
        stack_trace: getStacktrace(),
      });

      this.handleResponse({ status: Status.Failed, statusCode: 0 }, list);
    }
  }

  handleResponse(res: Response, list: Context[]) {
    if (!isSuccessStatusCode(res.statusCode)) {
      this.diagnosticsClient?.recordEvent('analytics.events.unsuccessful', {
        events: list.map((context) => context.event.event_type),
        code: res.statusCode,
        status: res.status,
        body: getResponseBodyString(res),
        stack_trace: getStacktrace(),
      });
    }

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
    // A successful upload means the server is reachable again; clear any pending
    // offline recovery and reset the backoff.
    this.resetOfflineRetry();
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

    // Transient failures (5xx / network errors / timeouts) should never drop events.
    // When the offline feature is enabled, mirror the mobile SDKs: once the retry
    // budget is exhausted, retain the events and go offline instead of dropping them,
    // then auto-recover on a backoff (see enterOfflineMode). When the offline feature
    // is disabled, fall back to the legacy drop-after-max-retries behavior.
    if (this.isOfflineEnabled()) {
      const { tryable, exceeded } = this.partitionByRetryBudget(later);
      if (exceeded.length > 0) {
        this.enterOfflineMode(exceeded);
      }
      this.scheduleEvents(tryable);
      return;
    }

    const tryable = this.removeEventsExceedFlushMaxRetries(later);
    this.scheduleEvents(tryable);
  }

  // Called when transient failures exhaust the retry budget. Retains the events (they
  // stay in the queue and on storage), flips the SDK offline, and schedules an
  // automatic recovery. Unlike the connectivity checker — which only comes back online
  // on a real `navigator`/NetInfo network transition — this recovery is time-based, so
  // a server-only outage (where the device network never drops) does not leave the SDK
  // stuck offline until the page reloads.
  enterOfflineMode(retained: Context[]) {
    // Give the retained events a fresh retry budget so the next online window can try
    // them again rather than immediately re-exhausting the limit.
    retained.forEach((context) => {
      context.attempts = 0;
      context.timeout = 0;
    });
    this.config.offline = true;
    this.config.loggerProvider.warn(
      `Upload failed after ${this.config.flushMaxRetries} retries; going offline and retaining ${retained.length} event(s) for retry.`,
    );
    this.scheduleOfflineRetry();
  }

  // Schedule a single recovery attempt with capped exponential backoff. On fire, the
  // SDK comes back online and flushes the retained queue. If the server is still
  // unreachable, handleOtherResponse re-enters offline mode with a larger backoff, so
  // the SDK keeps retrying indefinitely (until delivery or storage exhaustion).
  scheduleOfflineRetry() {
    // A recovery is already pending; don't stack timers.
    if (this.offlineRetryTimeout) {
      return;
    }
    const backoff = Math.min(MAX_OFFLINE_BACKOFF_INTERVAL, this.retryTimeout * Math.pow(2, this.offlineRetryAttempts));
    this.config.loggerProvider.debug(`Scheduling offline retry in ${backoff}ms.`);
    this.offlineRetryTimeout = setTimeout(() => {
      this.offlineRetryTimeout = null;
      this.offlineRetryAttempts += 1;
      // Don't override an explicitly-disabled offline feature.
      if (this.config.offline !== OfflineDisabled) {
        this.config.offline = false;
      }
      // Flush everything that is queued, regardless of per-event timeout.
      this.queue.forEach((context) => (context.timeout = 0));
      void this.flush(true);
    }, backoff);
  }

  // Clear any pending recovery timer and reset the backoff. Called once the server is
  // reachable again (a successful upload).
  resetOfflineRetry() {
    this.offlineRetryAttempts = 0;
    if (this.offlineRetryTimeout) {
      clearTimeout(this.offlineRetryTimeout);
      this.offlineRetryTimeout = null;
    }
  }

  fulfillRequest(list: Context[], code: number, message: string) {
    // Record diagnostics for dropped events (non-success status codes)
    if (!isSuccessStatusCode(code)) {
      this.diagnosticsClient?.increment('analytics.events.dropped', list.length);
      this.diagnosticsClient?.recordEvent('analytics.events.dropped', {
        events: list.map((context) => context.event.event_type),
        code: code,
        message: message,
        stack_trace: getStacktrace(),
      });
    } else {
      this.diagnosticsClient?.increment('analytics.events.sent', list.length);
    }
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
