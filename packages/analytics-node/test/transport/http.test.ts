import { Http } from '../../src/transports/http';
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import { AddressInfo } from 'net';
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

// Regression coverage for SDK-188: each of these used to leave send() pending
// forever, wedging Destination.flushId and growing the event queue without bound.
describe('http transport: responses that never complete', () => {
  const payload = { api_key: '', events: [] };
  // Undefined for the tests that mock http.request instead of listening, so each
  // test in this block stays runnable on its own.
  let server: http.Server | undefined;
  let url: string;

  const listen = async (handler: http.RequestListener) => {
    const newServer = http.createServer(handler);
    server = newServer;
    await new Promise<void>((resolve) => newServer.listen(0, resolve));
    url = `http://localhost:${(newServer.address() as AddressInfo).port}/2/httpapi`;
  };

  const close = async () => {
    if (!server?.listening) {
      return;
    }
    server.closeAllConnections();
    await new Promise((resolve) => (server as http.Server).close(resolve));
  };

  afterEach(async () => {
    await close();
    server = undefined;
  });

  test('should time out when the server never responds', async () => {
    await listen(() => {
      // Accept the request and hold it open indefinitely.
    });

    const response = await new Http(50).send(url, payload);

    expect(response?.status).toBe(Status.Timeout);
    expect(response?.statusCode).toBe(408);
  });

  test('should fall back to the status code when the response body is empty', async () => {
    await listen((_, res) => {
      res.writeHead(200, { 'Content-Length': '0' });
      res.end();
    });

    const response = await new Http().send(url, payload);

    expect(response?.status).toBe(Status.Success);
    expect(response?.statusCode).toBe(200);
  });

  test('should report a truncated response as retryable', async () => {
    await listen((_, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '200' });
      res.write('{"code":200,"events_ingested":');
      setTimeout(() => res.socket?.destroy(), 10);
    });

    const response = await new Http().send(url, payload);

    expect(response?.status).toBe(Status.Unknown);
    expect(response?.statusCode).toBe(0);
  });

  test('should resolve null when the connection is refused', async () => {
    // Bind then release a port so the send() below is guaranteed to hit nothing.
    await listen(() => undefined);
    const port = ((server as http.Server).address() as AddressInfo).port;
    await close();

    const response = await new Http().send(`http://localhost:${port}/2/httpapi`, payload);

    expect(response).toBeNull();
  });

  test('should settle only once when the response errors after ending', async () => {
    // res 'end' with complete === false wins the race; the later 'aborted' and
    // 'error' events must not settle a second time.
    const res = new EventEmitter() as http.IncomingMessage;
    res.setEncoding = jest.fn();
    res.complete = false;
    const req = { on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
    jest.spyOn(http, 'request').mockImplementation(((_: unknown, cb: (r: http.IncomingMessage) => void) => {
      setImmediate(() => {
        cb(res);
        res.emit('end');
        res.emit('aborted');
        res.emit('error', new Error('ECONNRESET'));
      });
      return req;
    }) as unknown as typeof http.request);

    const response = await new Http().send('http://localhost:3000', payload);
    expect(response?.status).toBe(Status.Unknown);
    expect(response?.statusCode).toBe(0);
  });

  test('should abort the request when the deadline fires, even if the socket stays active', async () => {
    // A real socket-inactivity timer (req.setTimeout()) would never fire here,
    // since fake time never means the connection went idle. This proves the
    // deadline is wall-clock, not activity-based.
    jest.useFakeTimers();
    try {
      const req = { on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
      jest.spyOn(http, 'request').mockImplementation((() => req) as unknown as typeof http.request);

      const response = new Http(1234).send('http://localhost:3000', payload);
      await jest.advanceTimersByTimeAsync(1234);

      expect(req.destroy).toHaveBeenCalledTimes(1);
      const result = await response;
      expect(result?.status).toBe(Status.Timeout);
      expect(result?.statusCode).toBe(408);
    } finally {
      jest.useRealTimers();
    }
  });

  test('should clear the deadline once settled, so it never fires late', async () => {
    jest.useFakeTimers();
    try {
      const req = { on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
      jest.spyOn(http, 'request').mockImplementation(((_: unknown, cb: (r: http.IncomingMessage) => void) => {
        const res = new EventEmitter() as http.IncomingMessage;
        res.setEncoding = jest.fn();
        res.complete = true;
        setImmediate(() => {
          cb(res);
          res.emit('data', JSON.stringify({ code: 200 }));
          res.emit('end');
        });
        return req;
      }) as unknown as typeof http.request);

      const responsePromise = new Http(1234).send('http://localhost:3000', payload);
      await jest.advanceTimersByTimeAsync(0);
      expect((await responsePromise)?.status).toBe(Status.Success);

      await jest.advanceTimersByTimeAsync(1234);
      expect(req.destroy).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
