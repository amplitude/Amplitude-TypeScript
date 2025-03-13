/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Transport } from '../types/transport';
import { Status } from '../types/status';
import { Payload } from '../types/payload';
import { Response } from '../types/response';

export class BaseTransport implements Transport {
  send(_serverUrl: string, _payload: Payload): Promise<Response | null> {
    return Promise.resolve(null);
  }

  buildResponse(responseJSON: Record<string, any>): Response | null {
    if (typeof responseJSON !== 'object') {
      return null;
    }

    const statusCode = responseJSON.code || 0;
    const status = this.buildStatus(statusCode);

    switch (status) {
      case Status.Success:
        return {
          status,
          statusCode,
          body: {
            eventsIngested: responseJSON.events_ingested ?? 0,
            payloadSizeBytes: responseJSON.payload_size_bytes ?? 0,
            serverUploadTime: responseJSON.server_upload_time ?? 0,
          },
        };

      case Status.Invalid:
        return {
          status,
          statusCode,
          body: {
            error: responseJSON.error ?? '',
            missingField: responseJSON.missing_field ?? '',
            eventsWithInvalidFields: responseJSON.events_with_invalid_fields ?? {},
            eventsWithMissingFields: responseJSON.events_with_missing_fields ?? {},
            eventsWithInvalidIdLengths: responseJSON.events_with_invalid_id_lengths ?? {},
            epsThreshold: responseJSON.eps_threshold ?? 0,
            exceededDailyQuotaDevices: responseJSON.exceeded_daily_quota_devices ?? {},
            silencedDevices: responseJSON.silenced_devices ?? [],
            silencedEvents: responseJSON.silenced_events ?? [],
            throttledDevices: responseJSON.throttled_devices ?? {},
            throttledEvents: responseJSON.throttled_events ?? [],
          },
        };
      case Status.PayloadTooLarge:
        return {
          status,
          statusCode,
          body: {
            error: responseJSON.error ?? '',
          },
        };
      case Status.RateLimit:
        return {
          status,
          statusCode,
          body: {
            error: responseJSON.error ?? '',
            epsThreshold: responseJSON.eps_threshold ?? 0,
            throttledDevices: responseJSON.throttled_devices ?? {},
            throttledUsers: responseJSON.throttled_users ?? {},
            exceededDailyQuotaDevices: responseJSON.exceeded_daily_quota_devices ?? {},
            exceededDailyQuotaUsers: responseJSON.exceeded_daily_quota_users ?? {},
            throttledEvents: responseJSON.throttled_events ?? [],
          },
        };
      case Status.Timeout:
      default:
        return {
          status,
          statusCode,
        };
    }
  }

  buildStatus(code: number): Status {
    if (code >= 200 && code < 300) {
      return Status.Success;
    }

    if (code === 429) {
      return Status.RateLimit;
    }

    if (code === 413) {
      return Status.PayloadTooLarge;
    }

    if (code === 408) {
      return Status.Timeout;
    }

    if (code >= 400 && code < 500) {
      return Status.Invalid;
    }

    if (code >= 500) {
      return Status.Failed;
    }

    return Status.Unknown;
  }
}
