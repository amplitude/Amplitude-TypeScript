import {
  SuccessSummary as ISuccessSummary,
  InvalidRequestError as IInvalidRequestError,
  PayloadTooLargeError as IPayloadTooLargeError,
  ServerError as IServerError,
  ServiceUnavailableError as IServiceUnavailableError,
  TooManyRequestsForDeviceError as ITooManyRequestsForDeviceError,
} from '@amplitude/analytics-types';

export class SuccessSummary implements ISuccessSummary {
  public code = 200 as const;
  public name = 'SuccessSummary' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(
    public eventsIngested: number = 0,
    public payloadSizeBytes: number = 0,
    public serverUploadTime: number = 0,
  ) {}
}

export class BaseError extends Error {
  public code = 0;
  public name = 'BaseError';

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, BaseError.prototype);
  }
}

export class InvalidRequestError extends BaseError implements IInvalidRequestError {
  public code = 400 as const;
  public name = 'InvalidRequestError' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(
    public error: string = '',
    public missingField: string = '',
    public eventsWithInvalidFields: Record<string, number[]> = {},
    public eventsWithMissingFields: Record<string, number[]> = {},
  ) {
    super(error || undefined);
    Object.setPrototypeOf(this, InvalidRequestError.prototype);
  }
}

export class PayloadTooLargeError extends BaseError implements IPayloadTooLargeError {
  public code = 413 as const;
  public name = 'PayloadTooLargeError' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(public error: string = '') {
    super(error);
    Object.setPrototypeOf(this, PayloadTooLargeError.prototype);
  }
}

export class TooManyRequestsForDeviceError extends BaseError implements ITooManyRequestsForDeviceError {
  public code = 429 as const;
  public name = 'TooManyRequestsForDeviceError' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(
    public error: string = '',
    public epsThreshold: number = 0,
    public throttledDevices: Record<string, number> = {},
    public throttledUsers: Record<string, number> = {},
    public throttledEvents: number[] = [],
  ) {
    super(error || undefined);
    Object.setPrototypeOf(this, TooManyRequestsForDeviceError.prototype);
  }
}

export class ServerError extends BaseError implements IServerError {
  public code = 500 as const;
  public name = 'ServerError' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

export class ServiceUnavailableError extends BaseError implements IServiceUnavailableError {
  public code = 503 as const;
  public name = 'ServiceUnavailableError' as const;

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(message?: string) {
    super(message);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class UnexpectedError extends BaseError {
  public code = 0 as const;
  public name = 'UnexpectedError';

  // This exception is added due to a bug with instanbul: https://github.com/gotwarlost/istanbul/issues/690
  /* istanbul ignore next */
  constructor(error?: Error) {
    super(error ? error.message ?? String(error) : '');
    this.name = error?.name ?? this.name;
    this.stack = error?.stack ?? undefined;
    Object.setPrototypeOf(this, UnexpectedError.prototype);
  }
}
