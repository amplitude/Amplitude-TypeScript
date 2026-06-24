import { BrowserClient, Logger } from '@amplitude/analytics-core';
import { AppState, type AppStateStatus } from 'react-native';

import { appLifecyclePlugin } from '../../src/plugins/app-lifecycles';
import { useDefaultConfig } from '../helpers/default';

/* eslint-disable @typescript-eslint/unbound-method */

const createMockClient = (): jest.Mocked<Pick<BrowserClient, 'track'>> => ({
  track: jest.fn().mockReturnValue({ promise: Promise.resolve() }),
});

const setupPlugin = async () => {
  const plugin = appLifecyclePlugin();
  const client = createMockClient();
  await plugin.setup?.(useDefaultConfig(), client as unknown as BrowserClient);
  return { plugin, client };
};

describe('appLifecyclePlugin', () => {
  let changeListener: (status: AppStateStatus) => void;
  const mockRemove = jest.fn();

  beforeEach(() => {
    mockRemove.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') {
        changeListener = listener;
      }
      return { remove: mockRemove };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should expose plugin metadata', () => {
    const plugin = appLifecyclePlugin();
    expect(plugin.name).toBe('@amplitude/plugin-app-lifecycle-react-native');
    expect(plugin.type).toBe('enrichment');
  });

  describe('setup', () => {
    test('should subscribe to AppState changes', async () => {
      await setupPlugin();

      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(changeListener).toBeDefined();
    });

    test('should log an error when AppState is unavailable', async () => {
      jest.resetModules();
      jest.doMock('react-native', () => ({
        AppState: undefined,
      }));

      const { appLifecyclePlugin: pluginFactory } = await import('../../src/plugins/app-lifecycles');
      const plugin = pluginFactory();
      const config = useDefaultConfig();
      const logger = new Logger();
      const error = jest.spyOn(logger, 'error');
      config.loggerProvider = logger;
      const client = createMockClient();

      await plugin.setup?.(config, client as unknown as BrowserClient);

      expect(error).toHaveBeenCalledWith(expect.stringContaining('AppState'));
      expect(client.track).not.toHaveBeenCalled();

      jest.dontMock('react-native');
      jest.resetModules();
      await import('../../src/plugins/app-lifecycles');
    });
  });

  describe('app state changes', () => {
    test('should track Application Opened when app becomes active', async () => {
      const { client } = await setupPlugin();
      changeListener('active');
      expect(client.track).toHaveBeenCalledWith('[Amplitude] Application Opened');
    });

    test('should track Application Backgrounded when app enters background', async () => {
      const { client } = await setupPlugin();
      changeListener('background');
      expect(client.track).toHaveBeenCalledWith('[Amplitude] Application Backgrounded');
    });

    test('should not track for other app state transitions', async () => {
      const { client } = await setupPlugin();
      changeListener('inactive');
      changeListener('unknown' as AppStateStatus);
      changeListener('extension');
      expect(client.track).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    test('should pass through the event unchanged', async () => {
      const plugin = appLifecyclePlugin();
      const event = { event_type: 'custom_event' };
      await expect(plugin.execute?.(event)).resolves.toBe(event);
    });
  });

  describe('teardown', () => {
    test('should remove the subscription when remove is available', async () => {
      const { plugin } = await setupPlugin();
      await plugin.teardown?.();
      expect(mockRemove).toHaveBeenCalled();
    });

    test('should fall back to removeEventListener when subscription has no remove', async () => {
      jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
        if (event === 'change') {
          changeListener = listener;
        }
        return {} as ReturnType<typeof AppState.addEventListener>;
      });

      const appStateWithLegacyApi = AppState as typeof AppState & {
        removeEventListener: (type: string, listener: (status: AppStateStatus) => void) => void;
      };
      const removeEventListener = jest.fn();
      appStateWithLegacyApi.removeEventListener = removeEventListener;

      const { plugin } = await setupPlugin();
      await plugin.teardown?.();

      expect(removeEventListener).toHaveBeenCalledWith('change', changeListener);
      expect(mockRemove).not.toHaveBeenCalled();
    });
  });
});
