import { BrowserConfig, EnrichmentPlugin, ILogger } from '@amplitude/analytics-core';
import { performancePlugin } from '../../src/performance-plugin';
import { trackMainThreadBlock } from '../../src/autocapture/track-long-task';
import { createMockBrowserClient } from '../mock-browser-client';

jest.mock('../../src/autocapture/track-long-task', () => ({
  trackMainThreadBlock: jest.fn(),
}));

describe('performancePlugin', () => {
  const loggerProvider: Partial<ILogger> = {
    log: jest.fn(),
    warn: jest.fn(),
  };

  const config: Partial<BrowserConfig> = {
    defaultTracking: false,
    loggerProvider: loggerProvider as ILogger,
  };

  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    (trackMainThreadBlock as jest.Mock).mockReturnValue({ unsubscribe: mockUnsubscribe });
  });

  describe('setup', () => {
    it('should call trackMainThreadBlock with default duration threshold when mainThreadBlock is true', async () => {
      const plugin = performancePlugin({ mainThreadBlock: true });
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);

      expect(trackMainThreadBlock).toHaveBeenCalledWith({
        amplitude,
        options: { mainThreadBlock: true },
        durationThreshold: 100,
      });
    });

    it('should call trackMainThreadBlock with custom durationThreshold', async () => {
      const plugin = performancePlugin({ mainThreadBlock: { durationThreshold: 200 } });
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);

      expect(trackMainThreadBlock).toHaveBeenCalledWith({
        amplitude,
        options: { mainThreadBlock: { durationThreshold: 200 } },
        durationThreshold: 200,
      });
    });

    it('should use default duration threshold when mainThreadBlock is an object without durationThreshold', async () => {
      const plugin = performancePlugin({ mainThreadBlock: {} });
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);

      expect(trackMainThreadBlock).toHaveBeenCalledWith({
        amplitude,
        options: { mainThreadBlock: {} },
        durationThreshold: 100,
      });
    });

    it('should not call trackMainThreadBlock when mainThreadBlock=false', async () => {
      const plugin = performancePlugin({ mainThreadBlock: false });
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);

      expect(trackMainThreadBlock).not.toHaveBeenCalled();
    });

    it('should call trackMainThreadBlock when no options provided (default enables mainThreadBlock)', async () => {
      const plugin = performancePlugin();
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);

      expect(trackMainThreadBlock).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
    it('should return the event unchanged', async () => {
      const plugin = performancePlugin() as EnrichmentPlugin;
      const event = { event_type: 'test' };
      const result = await plugin.execute!(event as any);
      expect(result).toBe(event);
    });
  });

  describe('teardown', () => {
    it('should call unsubscribe on all subscriptions', async () => {
      const plugin = performancePlugin({ mainThreadBlock: true });
      const amplitude = createMockBrowserClient();
      await plugin.setup!(config as BrowserConfig, amplitude);
      await plugin.teardown!();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should not throw when there are no subscriptions', async () => {
      const plugin = performancePlugin({ mainThreadBlock: false });
      await expect(plugin.teardown!()).resolves.toBeUndefined();
    });
  });
});
