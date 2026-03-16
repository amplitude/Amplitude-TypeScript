import { AmplitudeUnified } from '../src/unified';
import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { ILogger } from '@amplitude/analytics-core';
import { SessionReplayPlugin } from '@amplitude/plugin-session-replay-browser';
import { experimentPlugin, ExperimentPlugin } from '@amplitude/plugin-experiment-browser';
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

  describe('constructor', () => {
    test('should construct client with no in-flight initAll promise', () => {
      const client = new AmplitudeUnified() as unknown as { _initAllPromise?: Promise<void> };
      expect(client._initAllPromise).toBeUndefined();
    });
  });

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
      expect(client.sessionReplay()).toBeUndefined();
      expect(client.experiment()).toBeUndefined();

      await client.initAll('test-api-key', unifiedOptions);

      expect(client.sessionReplay()).toBeDefined();
      expect(client.experiment()).toBeDefined();
    });

    test('should log when sr plugin is not found', async () => {
      const client = new AmplitudeUnified();
      const originalPlugin = client.plugin.bind(client);
      jest.spyOn(client, 'plugin').mockImplementation((name) => {
        if (name === SessionReplayPlugin.pluginName) return undefined;
        return originalPlugin(name);
      });
      expect(client.sessionReplay()).toBeUndefined();
      expect(client.experiment()).toBeUndefined();

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });

      expect(client.sessionReplay()).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(`${SessionReplayPlugin.pluginName} plugin is not found.`);
      expect(client.experiment()).toBeDefined();
    });

    test('should log when experiment plugin is not found', async () => {
      const client = new AmplitudeUnified();
      jest.spyOn(client, 'plugins').mockImplementation((_) => {
        return [];
      });
      expect(client.sessionReplay()).toBeUndefined();
      expect(client.experiment()).toBeUndefined();

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });

      expect(client.sessionReplay()).toBeDefined();
      expect(client.experiment()).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(`${ExperimentPlugin.pluginName} plugin is not found.`);
    });

    test('should log when multiple experiment instances are not found', async () => {
      const client = new AmplitudeUnified();
      jest.spyOn(client, 'plugins').mockImplementation((_) => {
        return [];
      });
      expect(client.sessionReplay()).toBeUndefined();
      expect(client.experiment()).toBeUndefined();

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });

      expect(client.sessionReplay()).toBeDefined();
      expect(client.experiment()).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(`${ExperimentPlugin.pluginName} plugin is not found.`);
    });

    test('should add library plugin', async () => {
      const spy = jest.spyOn(libraryModule, 'libraryPlugin');
      const client = new AmplitudeUnified();

      await client.initAll('test-api-key');

      expect(spy).toHaveBeenCalled();
    });

    test('should not throw when called concurrently without await', async () => {
      const client = new AmplitudeUnified();
      const p1 = client.initAll('test-api-key');
      const p2 = client.initAll('test-api-key');
      await expect(Promise.all([p1, p2])).resolves.toEqual([undefined, undefined]);
    });

    test('should wait for in-flight initAll for concurrent callers', async () => {
      const client = new AmplitudeUnified();
      const originalInit = (AmplitudeBrowser.prototype as any)._init as (...args: any[]) => Promise<void>;

      let unblockInit: () => void;
      const initBlocked = new Promise<void>((resolve) => {
        unblockInit = resolve;
      });

      const initSpy = jest
        .spyOn(AmplitudeBrowser.prototype as any, '_init')
        .mockImplementation(async function (this: AmplitudeBrowser, ...args: unknown[]) {
          await initBlocked;
          return originalInit.apply(this, args);
        });

      const p1 = client.initAll('test-api-key');
      const p2 = client.initAll('test-api-key');

      let secondCallResolved = false;
      void p2.then(() => {
        secondCallResolved = true;
      });

      await Promise.resolve();
      expect(secondCallResolved).toBe(false);

      unblockInit!();
      await Promise.all([p1, p2]);
      expect(initSpy).toHaveBeenCalledTimes(1);
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

  describe('experiment method', () => {
    test('should return undefined and log when multiple experiment instances', async () => {
      const client = new AmplitudeUnified();
      const experimentPlugin2 = experimentPlugin();
      // Have to change name because plugin with existing name will be ignored at registration
      experimentPlugin2.name = '@amplitude/experiment-analytics-plugin-2';

      await client.initAll('test-api-key', {
        analytics: {
          loggerProvider: mockLoggerProvider,
        },
      });
      await client.add(experimentPlugin2).promise;

      expect(client.plugin('@amplitude/experiment-analytics-plugin-2')).toBeDefined();
      expect(client.experiment()).toBeUndefined();
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(
        `Multiple instances of ${ExperimentPlugin.pluginName} are found.`,
      );
    });
  });
});
