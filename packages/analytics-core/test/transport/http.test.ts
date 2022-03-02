import { Http } from '../../src/transports/http';
import * as http from 'http';

describe('http transport', () => {
  test('should send to url', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {};

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
    expect(response.code).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('should handle error', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {};

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
        on: jest.fn().mockImplementation((_: string, cb: (error: Error) => void) => cb(new Error())),
        end: jest.fn(),
      } as any;
    });

    await expect(provider.send(url, payload)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('should handle unexpected error', async () => {
    const provider = new Http();
    const url = 'http://localhost:3000';
    const payload = {};

    const request = jest.spyOn(http, 'request').mockImplementation((_, cb) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      cb({
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
        on: jest.fn().mockImplementation((_: string, cb: (error: Error) => void) => cb(new Error())),
        end: jest.fn(),
      } as any;
    });

    await expect(provider.send(url, payload)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
