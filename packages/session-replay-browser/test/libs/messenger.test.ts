/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { WindowMessenger } from '../../src/libs/messenger';
import { getGlobalScope } from '@amplitude/analytics-core';
import { AMPLITUDE_ORIGIN, AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL } from '../../src/constants';
import { asyncLoadScript } from '../../src/helpers';

jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));

jest.mock('../../src/helpers', () => ({
  asyncLoadScript: jest.fn(),
}));

describe('WindowMessenger', () => {
  let mockGlobalScope: any;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockGlobalScope = {
      addEventListener: jest.fn(),
      opener: {
        postMessage: jest.fn(),
      },
    };

    (getGlobalScope as jest.Mock).mockReturnValue(mockGlobalScope);
    (asyncLoadScript as jest.Mock).mockResolvedValue({ status: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setup', () => {
    test('should setup messenger with default endpoint', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      expect(messenger['endpoint']).toBe(AMPLITUDE_ORIGIN);
      expect(messenger.logger).toBe(mockLogger);
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    test('should setup messenger with no config (default parameter)', () => {
      const messenger = new WindowMessenger();
      // Call setup with no arguments to test default parameter branch
      messenger.setup();

      expect(messenger['endpoint']).toBe(AMPLITUDE_ORIGIN);
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    test('should setup messenger with custom endpoint', () => {
      const customEndpoint = 'https://custom.example.com';
      const messenger = new WindowMessenger();
      messenger.setup({ endpoint: customEndpoint, logger: mockLogger });

      expect(messenger['endpoint']).toBe(customEndpoint);
    });

    test('should not setup if already setup', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const warnSpy = jest.spyOn(mockLogger, 'warn');
      messenger.setup({ logger: mockLogger });

      expect(warnSpy).toHaveBeenCalledWith('Messenger already setup, skipping duplicate setup');
      expect(mockGlobalScope.addEventListener).toHaveBeenCalledTimes(1);
    });

    test('should not setup if already setup when logger is undefined', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: undefined });

      // Should not throw when logger is undefined
      expect(() => {
        messenger.setup({ logger: undefined });
      }).not.toThrow();

      expect(mockGlobalScope.addEventListener).toHaveBeenCalledTimes(1);
    });

    test('should return early if global scope not available', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(null);
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot setup messenger: global scope not available');
      expect(mockGlobalScope.addEventListener).not.toHaveBeenCalled();
    });

    test('should return early if global scope not available when logger is undefined', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(null);
      const messenger = new WindowMessenger();

      // Should not throw when logger is undefined
      expect(() => {
        messenger.setup({ logger: undefined });
      }).not.toThrow();

      expect(mockGlobalScope.addEventListener).not.toHaveBeenCalled();
    });

    test('should notify parent window that page has loaded', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      expect(mockGlobalScope.opener.postMessage).toHaveBeenCalledWith(
        {
          source: 'amplitude-session-replay',
          action: 'page-loaded',
        },
        AMPLITUDE_ORIGIN,
      );
    });

    test('should handle initialize-background-capture message', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      // Get the message event listener
      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      // Mock global scope with amplitudeBackgroundCapture function
      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: jest.fn(() => ({
          close: jest.fn(),
        })),
      });

      // Simulate initialize-background-capture message
      const message = {
        source: 'amplitude-session-replay',
        action: 'initialize-background-capture',
      };

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: message,
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(asyncLoadScript).toHaveBeenCalledWith(
        new URL(AMPLITUDE_BACKGROUND_CAPTURE_SCRIPT_URL, AMPLITUDE_ORIGIN).toString(),
      );
    });

    test('should handle close-background-capture message when instance exists', () => {
      const messenger = new WindowMessenger();
      const mockClose = jest.fn();
      messenger['amplitudeBackgroundCaptureInstance'] = { close: mockClose };
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'close-background-capture',
        },
      });

      expect(mockClose).toHaveBeenCalled();
    });

    test('should handle close-background-capture message when instance does not exist', () => {
      const messenger = new WindowMessenger();
      messenger['amplitudeBackgroundCaptureInstance'] = null;
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      // Should not throw when instance is null
      expect(() => {
        messageListener({
          origin: AMPLITUDE_ORIGIN,
          data: {
            source: 'amplitude-session-replay',
            action: 'close-background-capture',
          },
        });
      }).not.toThrow();
    });

    test('should handle close-background-capture message when instance has no close method', () => {
      const messenger = new WindowMessenger();
      messenger['amplitudeBackgroundCaptureInstance'] = {}; // No close method
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      // Should not throw when instance has no close method
      expect(() => {
        messageListener({
          origin: AMPLITUDE_ORIGIN,
          data: {
            source: 'amplitude-session-replay',
            action: 'close-background-capture',
          },
        });
      }).not.toThrow();
    });

    test('should ignore messages from wrong origin', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const notifySpy = jest.spyOn(messenger, 'notify');

      messageListener({
        origin: 'https://wrong-origin.com',
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      expect(notifySpy).not.toHaveBeenCalled();
    });

    test('should ignore messages without action', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const notifySpy = jest.spyOn(messenger, 'notify');

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
        },
      });

      expect(notifySpy).not.toHaveBeenCalled();
    });

    test('should handle request responses', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const requestPromise = messenger.request({ action: 'page-loaded' });

      // postMessage is called synchronously, so get the request ID immediately
      const postMessageCalls = mockGlobalScope.opener.postMessage.mock.calls;
      const requestCall = postMessageCalls[postMessageCalls.length - 1];
      expect(requestCall).toBeDefined();
      const requestId = requestCall[0].requestId;
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(/^req_\d+$/);

      // Verify callback is registered
      expect(messenger['requestCallbacks'].has(requestId)).toBe(true);

      // Send response via message listener
      // Note: The code checks for action first, but requestId handling happens after
      // So we need to provide an action (even if it's not used for responses)
      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          requestId,
          action: 'page-loaded', // Action is required to pass the !action check
          data: { result: 'success' },
        },
      } as MessageEvent);

      const result = await requestPromise;
      expect(result).toEqual({ result: 'success' });
    });
  });

  describe('notify', () => {
    test('should send message to parent window', () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      messenger.notify({ action: 'background-capture-loaded' });

      expect(mockGlobalScope.opener.postMessage).toHaveBeenCalledWith(
        {
          source: 'amplitude-session-replay',
          action: 'background-capture-loaded',
        },
        AMPLITUDE_ORIGIN,
      );
    });

    test('should warn if messenger not setup', () => {
      const messenger = new WindowMessenger();
      const mockWarnLogger = {
        warn: jest.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      messenger.logger = mockWarnLogger as any;
      messenger.notify({ action: 'page-loaded' });

      expect(mockWarnLogger.warn).toHaveBeenCalledWith('Cannot notify: messenger not setup');
    });

    test('should handle notify when logger is undefined and endpoint is not set', () => {
      const messenger = new WindowMessenger();
      messenger.logger = undefined;
      messenger['endpoint'] = undefined; // Not set

      // Should not throw when logger is undefined (optional chaining handles it)
      // This covers the this.logger?.warn branch on line 131 when endpoint is not set
      expect(() => {
        messenger.notify({ action: 'page-loaded' });
      }).not.toThrow();

      // Verify postMessage was NOT called (endpoint check failed)
      expect(mockGlobalScope.opener.postMessage).not.toHaveBeenCalled();
    });

    test('should warn if no window.opener', () => {
      (getGlobalScope as jest.Mock).mockReturnValue({
        addEventListener: jest.fn(),
        opener: null,
      });

      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });
      messenger.notify({ action: 'page-loaded' });

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot notify: no window.opener');
    });

    test('should handle notify when logger is undefined and no opener', () => {
      (getGlobalScope as jest.Mock).mockReturnValue({
        addEventListener: jest.fn(),
        opener: null,
      });

      const messenger = new WindowMessenger();
      messenger.setup({ logger: undefined });
      messenger['endpoint'] = AMPLITUDE_ORIGIN;

      // Should not throw when logger is undefined
      expect(() => {
        messenger.notify({ action: 'page-loaded' });
      }).not.toThrow();
    });

    test('should handle notify when globalScope is null', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(null);

      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });
      messenger['endpoint'] = AMPLITUDE_ORIGIN;

      // Should not throw when globalScope is null (optional chaining handles it)
      expect(() => {
        messenger.notify({ action: 'page-loaded' });
      }).not.toThrow();
    });

    test('should handle notify when logger is undefined and globalScope is null', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(null);

      const messenger = new WindowMessenger();
      messenger.setup({ logger: undefined });
      messenger['endpoint'] = AMPLITUDE_ORIGIN;

      // Should not throw when both logger and globalScope are null/undefined
      expect(() => {
        messenger.notify({ action: 'page-loaded' });
      }).not.toThrow();
    });
  });

  describe('request', () => {
    test('should send request and wait for response', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const requestPromise = messenger.request({ action: 'page-loaded' });

      // postMessage is called synchronously, so get the request ID immediately
      const postMessageCalls = mockGlobalScope.opener.postMessage.mock.calls;
      const requestCall = postMessageCalls[postMessageCalls.length - 1];
      expect(requestCall).toBeDefined();
      const requestId = requestCall[0].requestId;
      expect(requestId).toBeDefined();
      expect(requestId).toMatch(/^req_\d+$/);

      // Verify callback is registered
      expect(messenger['requestCallbacks'].has(requestId)).toBe(true);

      // Send response via message listener
      // Note: The code checks for action first, but requestId handling happens after
      // So we need to provide an action (even if it's not used for responses)
      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          requestId,
          action: 'page-loaded', // Action is required to pass the !action check
          data: { result: 'success' },
        },
      } as MessageEvent);

      const result = await requestPromise;
      expect(result).toEqual({ result: 'success' });
    });

    test('should reject if messenger not setup', () => {
      const messenger = new WindowMessenger();
      return expect(messenger.request({ action: 'page-loaded' })).rejects.toThrow('Messenger not setup');
    });

    test('should reject if no window.opener', () => {
      (getGlobalScope as jest.Mock).mockReturnValue({
        addEventListener: jest.fn(),
        opener: null,
      });

      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      return expect(messenger.request({ action: 'page-loaded' })).rejects.toThrow('No window.opener');
    });

    test('should reject if globalScope is null in request', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(null);

      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      return expect(messenger.request({ action: 'page-loaded' })).rejects.toThrow('No window.opener');
    });

    test('should timeout if no response received', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const requestPromise = messenger.request({ action: 'page-loaded' }, 10);

      await expect(requestPromise).rejects.toThrow(/timed out after 10ms/);
    });
  });

  describe('initializeBackgroundCapture', () => {
    test('should load script and initialize background capture', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const mockBackgroundCapture = jest.fn(() => ({
        close: jest.fn(),
      }));

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: mockBackgroundCapture,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(asyncLoadScript).toHaveBeenCalled();
      expect(mockBackgroundCapture).toHaveBeenCalledWith({
        messenger,
        onBackgroundCapture: expect.any(Function),
      });
    });

    test('should warn if amplitudeBackgroundCapture function not found', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: undefined,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockLogger.warn).toHaveBeenCalledWith('amplitudeBackgroundCapture function not found on global scope');
    });

    test('should handle when globalScope is null in initializeBackgroundCapture', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      (getGlobalScope as jest.Mock).mockReturnValue(null);

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should not throw, optional chaining handles null
      expect(asyncLoadScript).toHaveBeenCalled();
    });

    test('should handle when logger is undefined in initializeBackgroundCapture', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: undefined });

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: undefined,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      // Should not throw when logger is undefined
      expect(() => {
        messageListener({
          origin: AMPLITUDE_ORIGIN,
          data: {
            source: 'amplitude-session-replay',
            action: 'initialize-background-capture',
          },
        });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    test('should handle script load error', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      (asyncLoadScript as jest.Mock).mockRejectedValue(new Error('Script load failed'));

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to initialize background capture:', expect.any(Error));
    });

    test('should handle script load error when logger is undefined', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: undefined });

      (asyncLoadScript as jest.Mock).mockRejectedValue(new Error('Script load failed'));

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];

      // Should not throw when logger is undefined
      expect(() => {
        messageListener({
          origin: AMPLITUDE_ORIGIN,
          data: {
            source: 'amplitude-session-replay',
            action: 'initialize-background-capture',
          },
        });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    test('should notify parent when background capture is loaded', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const mockBackgroundCapture = jest.fn(() => ({
        close: jest.fn(),
      }));

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: mockBackgroundCapture,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const notifySpy = jest.spyOn(messenger, 'notify');

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(notifySpy).toHaveBeenCalledWith({ action: 'background-capture-loaded' });
    });
  });

  describe('onBackgroundCapture', () => {
    test('should notify parent when background capture is complete', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const mockBackgroundCapture = jest.fn((config: any) => {
        // Call the onBackgroundCapture callback
        config.onBackgroundCapture('background-capture-complete', { data: 'test' });
        return { close: jest.fn() };
      });

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: mockBackgroundCapture,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const notifySpy = jest.spyOn(messenger, 'notify');

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(notifySpy).toHaveBeenCalledWith({
        action: 'background-capture-complete',
        data: { data: 'test' },
      });
    });

    test('should not notify for unknown background capture types', async () => {
      const messenger = new WindowMessenger();
      messenger.setup({ logger: mockLogger });

      const mockBackgroundCapture = jest.fn((config: any) => {
        config.onBackgroundCapture('unknown-type', {});
        return { close: jest.fn() };
      });

      (getGlobalScope as jest.Mock).mockReturnValue({
        ...mockGlobalScope,
        amplitudeBackgroundCapture: mockBackgroundCapture,
      });

      const messageListener = mockGlobalScope.addEventListener.mock.calls[0][1];
      const notifySpy = jest.spyOn(messenger, 'notify');

      messageListener({
        origin: AMPLITUDE_ORIGIN,
        data: {
          source: 'amplitude-session-replay',
          action: 'initialize-background-capture',
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should only be called for background-capture-loaded, not for unknown type
      const backgroundCaptureCompleteCalls = notifySpy.mock.calls.filter(
        (call) => call[0].action === 'background-capture-complete',
      );
      expect(backgroundCaptureCompleteCalls).toHaveLength(0);
    });
  });
});
