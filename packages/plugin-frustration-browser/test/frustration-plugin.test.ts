import { BrowserClient, BrowserConfig, getGlobalScope } from '@amplitude/analytics-core';
import { frustrationPlugin } from '../src/frustration-plugin';
import { RAGE_CLICK_EVENT_NAME } from '../src/constants';
import * as rageClick from '../src/rage-click';

/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment,  @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */

jest.mock('../src/rage-click', () => ({
  init: jest.fn(),
  registerClick: jest.fn(),
  clear: jest.fn(),
}));

jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));

describe('frustration-plugin', () => {
  let mockAmplitude: BrowserClient;
  let mockDocument: Document;
  let mockClickHandler: (event: MouseEvent) => void;
  let mockConfig: BrowserConfig;

  beforeEach(() => {
    jest.useFakeTimers();
    mockAmplitude = {
      track: jest.fn(),
    } as unknown as BrowserClient;

    mockConfig = {
      apiKey: 'test-api-key',
      sessionTimeout: 30 * 60 * 1000,
      trackingOptions: {
        ipAddress: true,
        language: true,
        platform: true,
      },
      flushIntervalMillis: 1000,
      flushMaxRetries: 5,
      flushQueueSize: 30,
      logLevel: 0,
      optOut: false,
      serverUrl: 'https://api2.amplitude.com/2/httpapi',
      serverZone: 'US',
      useBatch: false,
      loggerProvider: {
        debug: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      transportProvider: {
        send: jest.fn(),
      },
      cookieStorage: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
      },
    } as unknown as BrowserConfig;

    // Mock document and addEventListener
    mockDocument = {
      addEventListener: jest.fn((event, handler) => {
        if (event === 'click') {
          mockClickHandler = handler;
        }
      }),
      removeEventListener: jest.fn(),
    } as unknown as Document;

    // Mock getGlobalScope
    (getGlobalScope as jest.Mock).mockReturnValue({
      document: mockDocument,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should initialize rage click tracking on setup', async () => {
    const plugin = frustrationPlugin();
    const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
    await setup(mockConfig, mockAmplitude);

    expect(rageClick.init).toHaveBeenCalledWith({
      timeout: 3000,
      threshold: 3,
      ignoreSelector: '#ignore-rage-click',
      onRageClick: expect.any(Function),
    });
  });

  it('should register document click handler on setup', async () => {
    const plugin = frustrationPlugin();
    const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
    await setup(mockConfig, mockAmplitude);

    expect(mockDocument.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('should send click event to rage click when target is HTMLElement', async () => {
    const plugin = frustrationPlugin();
    const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
    await setup(mockConfig, mockAmplitude);

    const clickHandler = (mockDocument.addEventListener as jest.Mock).mock.calls[0][1] as (event: MouseEvent) => void;
    const element = document.createElement('button');
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: element });

    clickHandler(event);

    expect(rageClick.registerClick).toHaveBeenCalledWith(element, event);
  });

  describe('element text handling', () => {
    let plugin: ReturnType<typeof frustrationPlugin>;
    let onRageClickCallback: (clickEvent: any, element: HTMLElement) => void;

    beforeEach(async () => {
      plugin = frustrationPlugin();
      const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
      await setup(mockConfig, mockAmplitude);
      onRageClickCallback = (rageClick.init as jest.Mock).mock.calls[0][0].onRageClick;
    });

    it('should use innerText when available', () => {
      const element = document.createElement('button');
      element.innerText = 'Click Me';
      const mockClickEvent = {
        begin: 1000,
        end: 2000,
        clicks: [{ x: 100, y: 200, timestamp: 1000 }],
      };

      onRageClickCallback(mockClickEvent, element);

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        RAGE_CLICK_EVENT_NAME,
        expect.objectContaining({
          '[Amplitude] Element Text': 'Click Me',
        }),
      );
    });

    it('should fall back to textContent when innerText is not available', () => {
      const element = document.createElement('button');
      Object.defineProperty(element, 'innerText', { value: undefined });
      element.textContent = 'Click Me';
      const mockClickEvent = {
        begin: 1000,
        end: 2000,
        clicks: [{ x: 100, y: 200, timestamp: 1000 }],
      };

      onRageClickCallback(mockClickEvent, element);

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        RAGE_CLICK_EVENT_NAME,
        expect.objectContaining({
          '[Amplitude] Element Text': 'Click Me',
        }),
      );
    });

    it('should use empty string when no text content is available', () => {
      const element = document.createElement('button');
      Object.defineProperty(element, 'innerText', { value: undefined });
      Object.defineProperty(element, 'textContent', { value: null });
      const mockClickEvent = {
        begin: 1000,
        end: 2000,
        clicks: [{ x: 100, y: 200, timestamp: 1000 }],
      };

      onRageClickCallback(mockClickEvent, element);

      expect(mockAmplitude.track).toHaveBeenCalledWith(
        RAGE_CLICK_EVENT_NAME,
        expect.objectContaining({
          '[Amplitude] Element Text': '',
        }),
      );
    });
  });

  it('should track rage click events with correct payload', async () => {
    const plugin = frustrationPlugin();
    const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
    await setup(mockConfig, mockAmplitude);

    // Get the onRageClick callback that was passed to init
    const onRageClickCallback = (rageClick.init as jest.Mock).mock.calls[0][0].onRageClick;

    // Create mock click event and element
    const mockElement = document.createElement('button');
    mockElement.innerText = 'Test Button';
    const mockClickEvent = {
      begin: 1000,
      end: 2000,
      clicks: [
        { x: 100, y: 200, timestamp: 1000 },
        { x: 100, y: 200, timestamp: 1500 },
        { x: 100, y: 200, timestamp: 2000 },
      ],
    };

    // Call the callback
    onRageClickCallback(mockClickEvent, mockElement);

    // Verify amplitude.track was called with correct payload
    expect(mockAmplitude.track).toHaveBeenCalledWith(RAGE_CLICK_EVENT_NAME, {
      '[Amplitude] Begin Time': 1000,
      '[Amplitude] End Time': 2000,
      '[Amplitude] Duration': 1000,
      '[Amplitude] Element Text': 'Test Button',
      '[Amplitude] Element Tag': 'button',
      '[Amplitude] Clicks': mockClickEvent.clicks,
    });
  });

  it('should pass through events in execute', async () => {
    const plugin = frustrationPlugin();
    const execute = plugin.execute as (event: any) => Promise<any>;
    const mockEvent = { event_type: 'test_event' };
    const result = await execute(mockEvent);

    expect(result).toBe(mockEvent);
  });

  it('should clean up on teardown', async () => {
    const plugin = frustrationPlugin();
    const setup = plugin.setup as (config: BrowserConfig, client: BrowserClient) => Promise<void>;
    const teardown = plugin.teardown as () => Promise<void>;
    await setup(mockConfig, mockAmplitude);
    await teardown();

    expect(mockDocument.removeEventListener).toHaveBeenCalledWith('click', mockClickHandler);
    expect(rageClick.clear).toHaveBeenCalled();
  });
});
