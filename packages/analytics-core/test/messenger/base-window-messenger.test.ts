/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/unbound-method */
import { getOrCreateWindowMessenger } from '../../src/messenger/base-window-messenger';
import type { BaseWindowMessenger } from '../../src/messenger/base-window-messenger';
import { AMPLITUDE_ORIGIN } from '../../src/messenger/constants';
import * as utils from '../../src/messenger/utils';
import * as globalScopeModule from '../../src/global-scope';

const MESSENGER_GLOBAL_KEY = '__AMPLITUDE_MESSENGER__';
const MESSENGER_BRAND = '__AMPLITUDE_MESSENGER_INSTANCE__';

function createLogger() {
  return {
    disable: jest.fn(),
    enable: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function postMessageToWindow(data: any, origin: string) {
  const event = new MessageEvent('message', { data, origin });
  window.dispatchEvent(event);
}

describe('BaseWindowMessenger', () => {
  let messenger: BaseWindowMessenger;

  beforeEach(() => {
    // Clean global singleton between tests
    const g = globalThis as Record<string, unknown>;
    delete g[MESSENGER_GLOBAL_KEY];
  });

  afterEach(() => {
    messenger?.destroy();
    jest.restoreAllMocks();
    const g = globalThis as Record<string, unknown>;
    delete g[MESSENGER_GLOBAL_KEY];
  });

  describe('getOrCreateWindowMessenger', () => {
    test('should create a new messenger with default origin', () => {
      messenger = getOrCreateWindowMessenger();

      expect(messenger.endpoint).toBe(AMPLITUDE_ORIGIN);
      expect((messenger as any)[MESSENGER_BRAND]).toBe(true);
    });

    test('should create a new messenger with custom origin', () => {
      messenger = getOrCreateWindowMessenger({ origin: 'https://custom.example.com' });

      expect(messenger.endpoint).toBe('https://custom.example.com');
    });

    test('should return the same singleton on subsequent calls', () => {
      messenger = getOrCreateWindowMessenger();
      const second = getOrCreateWindowMessenger();

      expect(second).toBe(messenger);
    });

    test('should store messenger on globalScope', () => {
      messenger = getOrCreateWindowMessenger();

      const g = globalThis as Record<string, unknown>;
      expect(g[MESSENGER_GLOBAL_KEY]).toBe(messenger);
    });

    test('should not reuse a non-branded value on globalScope', () => {
      const g = globalThis as Record<string, unknown>;
      g[MESSENGER_GLOBAL_KEY] = { fake: true };

      messenger = getOrCreateWindowMessenger();

      expect((messenger as any)[MESSENGER_BRAND]).toBe(true);
      expect(g[MESSENGER_GLOBAL_KEY]).toBe(messenger);
    });

    test('should handle undefined globalScope', () => {
      jest.spyOn(globalScopeModule, 'getGlobalScope').mockReturnValue(undefined);

      messenger = getOrCreateWindowMessenger();

      expect(messenger.endpoint).toBe(AMPLITUDE_ORIGIN);
    });
  });

  describe('notify', () => {
    test('should call postMessage on window.opener', () => {
      messenger = getOrCreateWindowMessenger();
      const mockPostMessage = jest.fn();
      Object.defineProperty(window, 'opener', {
        value: { postMessage: mockPostMessage },
        writable: true,
        configurable: true,
      });

      messenger.notify({ action: 'test-action', data: { key: 'value' } });

      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'test-action', data: { key: 'value' } }, AMPLITUDE_ORIGIN);

      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    });

    test('should log debug when logger is set', () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();
      messenger.setup({ logger });

      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
      messenger.notify({ action: 'test' });

      expect(logger.debug).toHaveBeenCalledWith('Message sent: ', expect.any(String));
    });

    test('should not throw when window.opener is null', () => {
      messenger = getOrCreateWindowMessenger();
      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });

      expect(() => messenger.notify({ action: 'test' })).not.toThrow();
    });
  });

  describe('setup', () => {
    test('should set the logger', () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();

      messenger.setup({ logger });

      expect(messenger.logger).toBe(logger);
    });

    test('should override endpoint when still at default', () => {
      messenger = getOrCreateWindowMessenger();

      messenger.setup({ endpoint: 'https://app.eu.amplitude.com' });

      expect(messenger.endpoint).toBe('https://app.eu.amplitude.com');
    });

    test('should not override a previously customized endpoint', () => {
      messenger = getOrCreateWindowMessenger({ origin: 'https://custom.example.com' });

      messenger.setup({ endpoint: 'https://app.eu.amplitude.com' });

      expect(messenger.endpoint).toBe('https://custom.example.com');
    });

    test('should be idempotent — second call should not attach another listener', () => {
      messenger = getOrCreateWindowMessenger();
      const addSpy = jest.spyOn(window, 'addEventListener');

      messenger.setup();
      messenger.setup();

      const messageCalls = addSpy.mock.calls.filter(([type]) => type === 'message');
      expect(messageCalls).toHaveLength(1);
    });

    test('should notify page-loaded on first setup', () => {
      messenger = getOrCreateWindowMessenger();
      const mockPostMessage = jest.fn();
      Object.defineProperty(window, 'opener', {
        value: { postMessage: mockPostMessage },
        writable: true,
        configurable: true,
      });

      messenger.setup();

      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'page-loaded' }, AMPLITUDE_ORIGIN);

      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    });

    test('should update logger on second setup call', () => {
      messenger = getOrCreateWindowMessenger();
      const logger1 = createLogger();
      const logger2 = createLogger();

      messenger.setup({ logger: logger1 });
      messenger.setup({ logger: logger2 });

      expect(messenger.logger).toBe(logger2);
    });

    test('should work when called with no arguments', () => {
      messenger = getOrCreateWindowMessenger();

      expect(() => messenger.setup()).not.toThrow();
    });
  });

  describe('message handling', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
    });

    test('should ignore messages from non-matching origins', () => {
      messenger = getOrCreateWindowMessenger();
      const handler = jest.fn();
      messenger.registerActionHandler('test-action', handler);
      messenger.setup();

      postMessageToWindow({ action: 'test-action' }, 'https://evil.example.com');

      expect(handler).not.toHaveBeenCalled();
    });

    test('should ignore messages without action', () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();
      messenger.setup({ logger });

      postMessageToWindow({ noAction: true }, AMPLITUDE_ORIGIN);

      expect(logger.debug).toHaveBeenCalledWith('Message received: ', expect.any(String));
    });

    test('should dispatch to registered action handlers', () => {
      messenger = getOrCreateWindowMessenger();
      const handler = jest.fn();
      messenger.registerActionHandler('my-action', handler);
      messenger.setup();

      postMessageToWindow({ action: 'my-action', data: { foo: 'bar' } }, AMPLITUDE_ORIGIN);

      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });

    test('should respond to ping with pong', () => {
      messenger = getOrCreateWindowMessenger();
      const mockPostMessage = jest.fn();
      Object.defineProperty(window, 'opener', {
        value: { postMessage: mockPostMessage },
        writable: true,
        configurable: true,
      });
      messenger.setup();
      mockPostMessage.mockClear();

      postMessageToWindow({ action: 'ping' }, AMPLITUDE_ORIGIN);

      expect(mockPostMessage).toHaveBeenCalledWith({ action: 'pong' }, AMPLITUDE_ORIGIN);
    });

    test('should handle response messages with id by resolving the callback', async () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();
      messenger.setup({ logger });

      const callbackId = 'test-id-123';
      const resolveFn = jest.fn();
      messenger.requestCallbacks[callbackId] = { resolve: resolveFn, reject: jest.fn() };

      postMessageToWindow(
        { action: 'some-response', id: callbackId, responseData: { result: 'ok' } },
        AMPLITUDE_ORIGIN,
      );

      expect(resolveFn).toHaveBeenCalledWith({ result: 'ok' });
      expect(messenger.requestCallbacks[callbackId]).toBeUndefined();
    });

    test('should warn when no callback exists for a response id', () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();
      messenger.setup({ logger });

      postMessageToWindow({ action: 'some-response', id: 'nonexistent-id', responseData: {} }, AMPLITUDE_ORIGIN);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nonexistent-id'));
    });

    test('should not dispatch action handler for messages with id', () => {
      messenger = getOrCreateWindowMessenger();
      const handler = jest.fn();
      messenger.registerActionHandler('my-action', handler);
      messenger.setup();

      messenger.requestCallbacks['req-1'] = { resolve: jest.fn(), reject: jest.fn() };
      postMessageToWindow({ action: 'my-action', id: 'req-1', responseData: {} }, AMPLITUDE_ORIGIN);

      expect(handler).not.toHaveBeenCalled();
    });

    test('should ignore action without a registered handler', () => {
      messenger = getOrCreateWindowMessenger();
      messenger.setup();

      expect(() => {
        postMessageToWindow({ action: 'unregistered-action' }, AMPLITUDE_ORIGIN);
      }).not.toThrow();
    });

    test('should warn for unknown response id without logger', () => {
      messenger = getOrCreateWindowMessenger();
      messenger.setup();

      expect(() => {
        postMessageToWindow({ action: 'resp', id: 'unknown-id', responseData: {} }, AMPLITUDE_ORIGIN);
      }).not.toThrow();
    });

    test('should handle null event data', () => {
      messenger = getOrCreateWindowMessenger();
      messenger.setup();

      expect(() => {
        postMessageToWindow(null, AMPLITUDE_ORIGIN);
      }).not.toThrow();
    });

    test('should handle event data with no action field', () => {
      messenger = getOrCreateWindowMessenger();
      messenger.setup();

      expect(() => {
        postMessageToWindow({}, AMPLITUDE_ORIGIN);
      }).not.toThrow();
    });
  });

  describe('registerActionHandler', () => {
    test('should register a handler', () => {
      messenger = getOrCreateWindowMessenger();
      const handler = jest.fn();

      messenger.registerActionHandler('my-action', handler);
      messenger.setup();

      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
      postMessageToWindow({ action: 'my-action', data: 42 }, AMPLITUDE_ORIGIN);

      expect(handler).toHaveBeenCalledWith(42);
    });

    test('should warn when overwriting an existing handler', () => {
      messenger = getOrCreateWindowMessenger();
      const logger = createLogger();
      messenger.setup({ logger });

      messenger.registerActionHandler('dup', jest.fn());
      messenger.registerActionHandler('dup', jest.fn());

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Overwriting'));
    });

    test('should not throw when overwriting without a logger', () => {
      messenger = getOrCreateWindowMessenger();

      messenger.registerActionHandler('dup', jest.fn());

      expect(() => messenger.registerActionHandler('dup', jest.fn())).not.toThrow();
    });
  });

  describe('sendRequest', () => {
    test('should send a request and register a callback', () => {
      messenger = getOrCreateWindowMessenger();
      const mockPostMessage = jest.fn();
      Object.defineProperty(window, 'opener', {
        value: { postMessage: mockPostMessage },
        writable: true,
        configurable: true,
      });
      jest.spyOn(utils, 'generateUniqueId').mockReturnValue('fixed-id');

      const promise = messenger.sendRequest('get-data', { key: 'val' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'fixed-id', action: 'get-data', args: { key: 'val' } }),
        AMPLITUDE_ORIGIN,
      );
      expect(messenger.requestCallbacks['fixed-id']).toBeDefined();

      messenger.requestCallbacks['fixed-id'].resolve('result');

      return expect(promise).resolves.toBe('result');
    });

    test('should reject on timeout', async () => {
      messenger = getOrCreateWindowMessenger();
      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
      jest.useFakeTimers();
      jest.spyOn(utils, 'generateUniqueId').mockReturnValue('timeout-id');

      const promise = messenger.sendRequest('slow-action', {}, { timeout: 500 });

      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('slow-action timed out (id: timeout-id)');
      expect(messenger.requestCallbacks['timeout-id']).toBeUndefined();

      jest.useRealTimers();
    });

    test('should reject on timeout with negative timeout', async () => {
      messenger = getOrCreateWindowMessenger();
      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
      jest.spyOn(utils, 'generateUniqueId').mockReturnValue('neg-timeout-id');

      // timeout <= 0 should not set a timer
      void messenger.sendRequest('action', {}, { timeout: -1 });

      expect(messenger.requestCallbacks['neg-timeout-id']).toBeDefined();

      messenger.requestCallbacks['neg-timeout-id'].resolve(undefined);
    });

    test('should not timeout when timeout is 0', async () => {
      messenger = getOrCreateWindowMessenger();
      Object.defineProperty(window, 'opener', { value: null, writable: true, configurable: true });
      jest.useFakeTimers();
      jest.spyOn(utils, 'generateUniqueId').mockReturnValue('no-timeout-id');

      void messenger.sendRequest('no-timeout-action', {}, { timeout: 0 });

      jest.advanceTimersByTime(60_000);

      expect(messenger.requestCallbacks['no-timeout-id']).toBeDefined();

      messenger.requestCallbacks['no-timeout-id'].resolve(undefined);
      jest.useRealTimers();
    });
  });

  describe('loadScriptOnce', () => {
    test('should call asyncLoadScript and resolve', async () => {
      messenger = getOrCreateWindowMessenger();
      jest.spyOn(utils, 'asyncLoadScript').mockResolvedValue({ status: true });

      await messenger.loadScriptOnce('https://cdn.example.com/script.js');

      expect(utils.asyncLoadScript).toHaveBeenCalledWith('https://cdn.example.com/script.js');
    });

    test('should deduplicate concurrent calls to the same URL', async () => {
      messenger = getOrCreateWindowMessenger();
      jest.spyOn(utils, 'asyncLoadScript').mockResolvedValue({ status: true });

      const p1 = messenger.loadScriptOnce('https://cdn.example.com/script.js');
      const p2 = messenger.loadScriptOnce('https://cdn.example.com/script.js');

      await Promise.all([p1, p2]);

      expect(utils.asyncLoadScript).toHaveBeenCalledTimes(1);
    });

    test('should allow different URLs to load independently', async () => {
      messenger = getOrCreateWindowMessenger();
      jest.spyOn(utils, 'asyncLoadScript').mockResolvedValue({ status: true });

      await messenger.loadScriptOnce('https://cdn.example.com/a.js');
      await messenger.loadScriptOnce('https://cdn.example.com/b.js');

      expect(utils.asyncLoadScript).toHaveBeenCalledTimes(2);
    });

    test('should remove failed loads from cache so retries work', async () => {
      messenger = getOrCreateWindowMessenger();
      const loadSpy = jest.spyOn(utils, 'asyncLoadScript');
      loadSpy.mockRejectedValueOnce(new Error('network error'));
      loadSpy.mockResolvedValueOnce({ status: true });

      await expect(messenger.loadScriptOnce('https://cdn.example.com/retry.js')).rejects.toThrow('network error');

      await messenger.loadScriptOnce('https://cdn.example.com/retry.js');

      expect(loadSpy).toHaveBeenCalledTimes(2);
    });

    test('should not retry a successful load', async () => {
      messenger = getOrCreateWindowMessenger();
      jest.spyOn(utils, 'asyncLoadScript').mockResolvedValue({ status: true });

      await messenger.loadScriptOnce('https://cdn.example.com/once.js');
      await messenger.loadScriptOnce('https://cdn.example.com/once.js');

      expect(utils.asyncLoadScript).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroy', () => {
    test('should remove the message listener', () => {
      messenger = getOrCreateWindowMessenger();
      const removeSpy = jest.spyOn(window, 'removeEventListener');
      messenger.setup();

      messenger.destroy();

      expect(removeSpy.mock.calls.some(([type]) => type === 'message')).toBe(true);
    });

    test('should clear all state', () => {
      messenger = getOrCreateWindowMessenger();
      messenger.setup();
      messenger.registerActionHandler('foo', jest.fn());
      messenger.requestCallbacks['test'] = { resolve: jest.fn(), reject: jest.fn() };

      messenger.destroy();

      expect(messenger.requestCallbacks).toEqual({});
    });

    test('should remove the singleton from globalScope', () => {
      messenger = getOrCreateWindowMessenger();
      const g = globalThis as Record<string, unknown>;

      expect(g[MESSENGER_GLOBAL_KEY]).toBe(messenger);

      messenger.destroy();

      expect(g[MESSENGER_GLOBAL_KEY]).toBeUndefined();
    });

    test('should not remove a different messenger from globalScope', () => {
      messenger = getOrCreateWindowMessenger();
      const g = globalThis as Record<string, unknown>;
      const other = { different: true };
      g[MESSENGER_GLOBAL_KEY] = other;

      messenger.destroy();

      expect(g[MESSENGER_GLOBAL_KEY]).toBe(other);
    });

    test('should be safe to call when not set up', () => {
      messenger = getOrCreateWindowMessenger();

      expect(() => messenger.destroy()).not.toThrow();
    });

    test('should allow re-setup after destroy', () => {
      messenger = getOrCreateWindowMessenger();
      const addSpy = jest.spyOn(window, 'addEventListener');

      messenger.setup();
      messenger.destroy();
      messenger.setup();

      const messageCalls = addSpy.mock.calls.filter(([type]) => type === 'message');
      expect(messageCalls).toHaveLength(2);
    });
  });
});
