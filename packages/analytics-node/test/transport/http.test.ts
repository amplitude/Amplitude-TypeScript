import { Http } from '../../src/transports/http';
import http from 'http';
import https from 'https';
import { Status } from '@amplitude/analytics-core';

describe('http transport', () => {
  test('should send to http url', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {
      api_key: '',
      events: [],
    };

    const request = jest.spyOn(http, 'request').mockImplementation((_, cb) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb({
        complete: true,
        on: jest.fn().mockImplementation((event: string, callback: (data?: string) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ code: 200 }));
          }
          if (event === 'end') {
            callback();
          }
        }),
        setEncoding: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        on: jest.fn().mockImplementation((_: string, cb: (error: Error) => void) => cb(new Error())),
        end: jest.fn(),
      } as any;
    });

    const response = await provider.send(url, payload);
    expect(response?.statusCode).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('should send to https url', async () => {
    const provider = new Http();
    const url = 'https://localhost:3000';
    const payload = {
      api_key: '',
      events: [],
    };

    const request = jest.spyOn(https, 'request').mockImplementation((_, cb) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb({
        complete: true,
        on: jest.fn().mockImplementation((event: string, callback: (data?: string) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ code: 200 }));
          }
          if (event === 'end') {
            callback();
          }
        }),
        setEncoding: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        on: jest.fn().mockImplementation((_: string, cb: (error: Error) => void) => cb(new Error())),
        end: jest.fn(),
      } as any;
    });

    const response = await provider.send(url, payload);
    expect(response?.statusCode).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('should throw an error if no protocal', () => {
    const provider = new Http();
    const url = 'localhost:3000';
    const payload = {
      api_key: '',
      events: [],
    };

    expect(() => provider.send(url, payload)).toThrow('Invalid server url');
  });

  test('should handle error', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {
      api_key: '',
      events: [],
    };

    const request = jest.spyOn(http, 'request').mockImplementation((_, cb) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb({
        complete: true,
        on: jest.fn().mockImplementation((event: string, callback: (data?: string) => void) => {
          if (event === 'data') {
            callback(JSON.stringify({ code: 400 }));
          }
          if (event === 'end') {
            callback();
          }
        }),
        setEncoding: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        on: jest.fn(),
        end: jest.fn(),
      } as any;
    });

    const response = await provider.send(url, payload);
    expect(response?.statusCode).toBe(400);
    expect(response?.status).toBe(Status.Invalid);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('should handle unexpected error', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {
      api_key: '',
      events: [],
    };

    const request = jest.spyOn(http, 'request').mockImplementation((_, cb) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb({
        statusCode: 502,
        complete: true,
        on: jest.fn().mockImplementation((event: string, callback: (data?: string) => void) => {
          if (event === 'data') {
            callback('<');
          }
          if (event === 'end') {
            callback();
          }
        }),
        setEncoding: jest.fn(),
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        on: jest.fn(),
        end: jest.fn(),
      } as any;
    });

    const response = await provider.send(url, payload);
    expect(response?.status).toBe(Status.Failed);
    expect(response?.statusCode).toBe(502);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
