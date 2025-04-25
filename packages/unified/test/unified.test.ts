import { AmplitudeUnified } from '../src/unified';
import { ILogger } from '@amplitude/analytics-core';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { ExperimentPlugin } from '@amplitude/plugin-experiment-browser';
import * as libraryModule from '../src/library';

type MockedLogger = jest.Mocked<ILogger>;

describe('AmplitudeUnified', () => {
  const mockLoggerProviderDebug = jest.fn();
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: mockLoggerProviderDebug,
  };

  describe('initAll', () => {
    test.each([
      {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      },
      undefined,
    ])('should initialize all plugins and assign sr and experiment properties', async (unifiedOptions) => {
      const client = new AmplitudeUnified();
      expect(client.sr).toBeUndefined();
      expect(client.experiment).toBeUndefined();

      await client.initAll('test-api-key', unifiedOptions);

      expect(client.sr).toBeDefined();
      expect(client.experiment).toBeDefined();
    });

    test('should log when sr plugin is not found', async () => {
      const client = new AmplitudeUnified();
      const originalPlugin = client.plugin.bind(client);
      jest.spyOn(client, 'plugin').mockImplementation((name) => {
        if (name === SessionReplayPlugin.pluginName) return undefined;
        return originalPlugin(name);
      });
      expect(client.sr).toBeUndefined();
      expect(client.experiment).toBeUndefined();

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });

      expect(client.sr).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(`${SessionReplayPlugin.pluginName} plugin is not found.`);
      expect(client.experiment).toBeDefined();
    });

    test('should log when experiment plugin is not found', async () => {
      const client = new AmplitudeUnified();
      const originalPlugin = client.plugin.bind(client);
      jest.spyOn(client, 'plugin').mockImplementation((name) => {
        if (name === ExperimentPlugin.pluginName) return undefined;
        return originalPlugin(name);
      });
      expect(client.sr).toBeUndefined();
      expect(client.experiment).toBeUndefined();

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });

      expect(client.sr).toBeDefined();
      expect(client.experiment).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(`${ExperimentPlugin.pluginName} plugin is not found.`);
    });

    test('should add library plugin', async () => {
      const spy = jest.spyOn(libraryModule, 'libraryPlugin');
      const client = new AmplitudeUnified();

      await client.initAll('test-api-key');

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('init', () => {
    test('init should initialize only analytics SDK and log', () => {
      const client = new AmplitudeUnified();

      const res = client.init('test-api-key', {
        loggerProvider: mockLoggerProvider,
      });
      expect(res).toBeDefined();
    });
  });
});
