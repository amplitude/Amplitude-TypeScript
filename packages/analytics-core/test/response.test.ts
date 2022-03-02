import {
  BaseError,
  InvalidRequestError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  SuccessSummary,
  TooManyRequestsForDeviceError,
  UnexpectedError,
} from '../src/response';

describe('response', () => {
  describe('SuccessSummary', () => {
    test('should return instance of SuccessSummary', () => {
      const response = new SuccessSummary(1, 1, 1);
      expect(response.code).toBe(200);
      expect(response.name).toBe('SuccessSummary');
      expect(response.eventsIngested).toBe(1);
      expect(response.payloadSizeBytes).toBe(1);
      expect(response.serverUploadTime).toBe(1);
    });

    test('should return instance of SuccessSummary with default values', () => {
      const response = new SuccessSummary();
      expect(response.code).toBe(200);
      expect(response.name).toBe('SuccessSummary');
      expect(response.eventsIngested).toBe(0);
      expect(response.payloadSizeBytes).toBe(0);
      expect(response.serverUploadTime).toBe(0);
    });
  });

  describe('BaseError', () => {
    test('should return instance of BaseError', () => {
      const response = new BaseError('oh no');
      expect(response.code).toBe(0);
      expect(response.name).toBe('BaseError');
      expect(response.message).toBe('oh no');
    });

    test('should return instance of BaseError with default value', () => {
      const response = new BaseError();
      expect(response.code).toBe(0);
      expect(response.name).toBe('BaseError');
      expect(response.message).toBe('');
    });
  });

  describe('InvalidRequestError', () => {
    test('should return instance of InvalidRequestError', () => {
      const response = new InvalidRequestError('oh no', 'missingField', { a: [1] }, { b: [2] });
      expect(response.code).toBe(400);
      expect(response.name).toBe('InvalidRequestError');
      expect(response.message).toBe('oh no');
      expect(response.error).toBe('oh no');
      expect(response.eventsWithInvalidFields).toEqual({ a: [1] });
      expect(response.eventsWithMissingFields).toEqual({ b: [2] });
    });

    test('should return instance of InvalidRequestError with default value', () => {
      const response = new InvalidRequestError();
      expect(response.code).toBe(400);
      expect(response.name).toBe('InvalidRequestError');
      expect(response.message).toBe('');
      expect(response.error).toBe('');
      expect(response.eventsWithInvalidFields).toEqual({});
      expect(response.eventsWithMissingFields).toEqual({});
    });
  });

  describe('PayloadTooLargeError', () => {
    test('should return instance of PayloadTooLargeError', () => {
      const response = new PayloadTooLargeError('oh no');
      expect(response.code).toBe(413);
      expect(response.name).toBe('PayloadTooLargeError');
      expect(response.message).toBe('oh no');
    });

    test('should return instance of PayloadTooLargeError with default value', () => {
      const response = new PayloadTooLargeError();
      expect(response.code).toBe(413);
      expect(response.name).toBe('PayloadTooLargeError');
      expect(response.message).toBe('');
    });
  });

  describe('TooManyRequestsForDeviceError', () => {
    test('should return instance of TooManyRequestsForDeviceError', () => {
      const response = new TooManyRequestsForDeviceError('oh no', 1, { a: 1 }, { b: 2 }, [1]);
      expect(response.code).toBe(429);
      expect(response.name).toBe('TooManyRequestsForDeviceError');
      expect(response.message).toBe('oh no');
      expect(response.epsThreshold).toBe(1);
      expect(response.throttledDevices).toEqual({ a: 1 });
      expect(response.throttledUsers).toEqual({ b: 2 });
      expect(response.throttledEvents).toEqual([1]);
    });

    test('should return instance of TooManyRequestsForDeviceError with default value', () => {
      const response = new TooManyRequestsForDeviceError();
      expect(response.code).toBe(429);
      expect(response.name).toBe('TooManyRequestsForDeviceError');
      expect(response.message).toBe('');
      expect(response.epsThreshold).toBe(0);
      expect(response.throttledUsers).toEqual({});
      expect(response.throttledDevices).toEqual({});
      expect(response.throttledEvents).toEqual([]);
    });
  });

  describe('ServerError', () => {
    test('should return instance of ServerError', () => {
      const response = new ServerError('oh no');
      expect(response.code).toBe(500);
      expect(response.name).toBe('ServerError');
      expect(response.message).toBe('oh no');
    });

    test('should return instance of ServerError with default value', () => {
      const response = new ServerError();
      expect(response.code).toBe(500);
      expect(response.name).toBe('ServerError');
      expect(response.message).toBe('');
    });
  });

  describe('ServiceUnavailableError', () => {
    test('should return instance of ServiceUnavailableError', () => {
      const response = new ServiceUnavailableError('oh no');
      expect(response.code).toBe(503);
      expect(response.name).toBe('ServiceUnavailableError');
      expect(response.message).toBe('oh no');
    });

    test('should return instance of ServiceUnavailableError with default value', () => {
      const response = new ServiceUnavailableError();
      expect(response.code).toBe(503);
      expect(response.name).toBe('ServiceUnavailableError');
      expect(response.message).toBe('');
    });
  });

  describe('UnexpectedError', () => {
    test('should return instance of UnexpectedError', () => {
      const originalError = new Error('oh no');
      const response = new UnexpectedError(originalError);
      expect(response.code).toBe(0);
      expect(response.message).toBe('oh no');
      expect(response.stack).toBe(originalError.stack);
    });

    test('should return instance of UnexpectedError with default value', () => {
      const response = new UnexpectedError();
      expect(response.code).toBe(0);
      expect(response.message).toBe('');
    });

    test('should return instance of UnexpectedError with string error', () => {
      // This is a test case for unexpected errors object
      // The eslint/ts exceptions are added since this case should not be
      // taken intentionally and at compile time; only at run time
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const response = new UnexpectedError('oh no');
      expect(response.code).toBe(0);
      expect(response.message).toBe('oh no');
    });
  });
});
