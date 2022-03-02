import {
  HttpResponse,
  TransportResponse,
  HttpInvalidRequestError,
  HttpPayloadTooLargeError,
  HttpServerError,
  HttpServiceUnavailableError,
  HttpSuccessSummary,
  HttpTooManyRequestsForDeviceError,
} from '@amplitude/analytics-types';
import {
  InvalidRequestError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  SuccessSummary,
  TooManyRequestsForDeviceError,
  UnexpectedError,
} from '../response';

export const buildResponse = (response: HttpResponse): TransportResponse => {
  if (is200(response)) {
    return new SuccessSummary(response.events_ingested, response.payload_size_bytes, response.server_upload_time);
  }
  if (is400(response)) {
    return new InvalidRequestError(
      response.error,
      response.missing_field,
      response.events_with_invalid_fields,
      response.events_with_missing_fields,
    );
  }
  if (is413(response)) {
    return new PayloadTooLargeError(response.error);
  }
  if (is429(response)) {
    return new TooManyRequestsForDeviceError(
      response.error,
      response.eps_threshold,
      response.throttled_devices,
      response.throttled_users,
      response.throttled_events,
    );
  }
  if (is500(response) || is502(response) || is504(response)) {
    return new ServerError();
  }

  if (is503(response)) {
    return new ServiceUnavailableError();
  }

  return new UnexpectedError(new Error(JSON.stringify(response)));
};

export const is200 = (response: HttpResponse): response is HttpSuccessSummary => response.code === 200;
export const is400 = (response: HttpResponse): response is HttpInvalidRequestError => response.code === 400;
export const is413 = (response: HttpResponse): response is HttpPayloadTooLargeError => response.code === 413;
export const is429 = (response: HttpResponse): response is HttpTooManyRequestsForDeviceError => response.code === 429;
export const is500 = (response: HttpResponse): response is HttpServerError => response.code === 500;
export const is502 = (response: HttpResponse): response is HttpServerError => response.code === 502;
export const is503 = (response: HttpResponse): response is HttpServiceUnavailableError => response.code === 503;
export const is504 = (response: HttpResponse): response is HttpServerError => response.code === 504;
