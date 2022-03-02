import {
  InvalidRequestError,
  PayloadTooLargeError,
  ServerError,
  SuccessSummary,
  TooManyRequestsForDeviceError,
  UnexpectedError,
} from '../../src/response';
import { buildResponse } from '../../src/utils/response-builder';

describe('buildResponse', () => {
  test('should handle status code 200', () => {
    expect(buildResponse({ code: 200 })).toEqual(new SuccessSummary());
  });

  test('should handle status code 400', () => {
    expect(buildResponse({ code: 400 })).toEqual(new InvalidRequestError());
  });

  test('should handle status code 413', () => {
    expect(buildResponse({ code: 413 })).toEqual(new PayloadTooLargeError());
  });

  test('should handle status code 429', () => {
    expect(buildResponse({ code: 429 })).toEqual(new TooManyRequestsForDeviceError());
  });

  test('should handle status code 500', () => {
    expect(buildResponse({ code: 500 })).toEqual(new ServerError());
  });

  test('should handle status code 502', () => {
    expect(buildResponse({ code: 502 })).toEqual(new ServerError());
  });

  test('should handle status code 503', () => {
    expect(buildResponse({ code: 503 })).toEqual(new ServerError());
  });

  test('should handle status code 504', () => {
    expect(buildResponse({ code: 504 })).toEqual(new ServerError());
  });

  test('should handle status code idk', () => {
    expect(buildResponse({ code: 0 })).toEqual(new UnexpectedError(new Error(JSON.stringify({ code: 0 }))));
  });
});
