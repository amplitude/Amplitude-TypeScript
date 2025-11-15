import { Timeline } from '../src/timeline';
import { DestinationPlugin, EnrichmentPlugin, Plugin } from '../src/types/plugin';
import { Event } from '../src/types/event/event';
import { useDefaultConfig, promiseState } from './helpers/default';
import { createTrackEvent } from '../src/utils/event-builder';
import { AmplitudeCore } from '../src/core-client';

describe('timeline', () => {
  let timeline = new Timeline(new AmplitudeCore());
  const mockLoggerProvider = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  timeline.loggerProvider = mockLoggerProvider;
  const config = useDefaultConfig();

  beforeEach(() => {
    timeline = new Timeline(new AmplitudeCore());
    timeline.loggerProvider = mockLoggerProvider;
    jest.clearAllMocks();
  });

  describe('register', () => {
    test('should accept empty plugin', async () => {
      await timeline.register({}, config);
      expect(timeline.plugins[0].name).toBeDefined();
      expect(timeline.plugins[0].type).toBe('enrichment');
    });

    test('should not register a plugin with the same name twice', async () => {
      const pluginName = 'TestPlugin';
      const plugin: EnrichmentPlugin = {
        name: pluginName,
        type: 'enrichment',
        setup: jest.fn(),
        teardown: jest.fn(),
        execute: jest.fn(),
      };

      await timeline.register(plugin, config);
      await timeline.register(plugin, config);

      expect(timeline.plugins).toHaveLength(1);
      expect(timeline.plugins[0].name).toBe('TestPlugin');
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        `Plugin with name ${pluginName} already exists, skipping registration`,
      );
    });

    test('should register plugins with different names', async () => {
      const plugin1: EnrichmentPlugin = {
        name: 'Plugin1',
        type: 'enrichment',
        setup: jest.fn(),
        teardown: jest.fn(),
        execute: jest.fn(),
      };
      const plugin2: EnrichmentPlugin = {
        name: 'Plugin2',
        type: 'enrichment',
        setup: jest.fn(),
        teardown: jest.fn(),
        execute: jest.fn(),
      };

      await timeline.register(plugin1, config);
      await timeline.register(plugin2, config);

      expect(timeline.plugins).toHaveLength(2);
      expect(timeline.plugins[0].name).toBe('Plugin1');
      expect(timeline.plugins[1].name).toBe('Plugin2');
    });

    test('should log when a plugin name is not set', async () => {
      const plugin: EnrichmentPlugin = {
        type: 'enrichment',
        setup: jest.fn(),
        teardown: jest.fn(),
        execute: jest.fn(),
      };

      await timeline.register(plugin, config);

      expect(timeline.plugins).toHaveLength(1);
      expect(timeline.plugins[0].name).not.toBeUndefined();
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('Plugin name is undefined'));
    });
  });

  describe('deregister', () => {
    test('should remove plugin correctly', async () => {
      await timeline.register(
        {
          name: 'test-plugin',
        },
        config,
      );
      expect(timeline.plugins.length).toBe(1);
      await timeline.deregister('test-plugin', config);
      expect(timeline.plugins.length).toBe(0);
    });

    test('should only remove plugin that was already registered', async () => {
      await timeline.register(
        {
          name: 'test-plugin',
        },
        config,
      );
      expect(timeline.plugins.length).toBe(1);
      await timeline.deregister('bad-test-plugin', config);
      expect(timeline.plugins.length).toBe(1);
    });
  });

  describe('reset', () => {
    test('should reset timeline', () => {
      const timeline = new Timeline(new AmplitudeCore());
      timeline.plugins = [];
      timeline.reset(new AmplitudeCore());
      expect(timeline.applying).toEqual(false);
      expect(timeline.plugins).toEqual([]);
    });

    test('should reset timeline without plugin.teardown', () => {
      const setup = jest.fn();
      const timeline = new Timeline(new AmplitudeCore());
      timeline.plugins = [
        {
          setup,
        },
      ];
      timeline.reset(new AmplitudeCore());
      expect(setup).toHaveBeenCalledTimes(0);
      expect(timeline.applying).toEqual(false);
      expect(timeline.plugins).toEqual([]);
    });

    test('should reset timeline with plugin.teardown', () => {
      const teardown = jest.fn();
      const timeline = new Timeline(new AmplitudeCore());
      timeline.plugins = [
        {
          teardown,
        },
      ];
      timeline.reset(new AmplitudeCore());
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(timeline.applying).toEqual(false);
      expect(timeline.plugins).toEqual([]);
    });
  });

  test('should update event using before/enrichment plugin', async () => {
    const beforeSetup = jest.fn().mockReturnValue(Promise.resolve());
    const beforeTeardown = jest.fn().mockReturnValue(Promise.resolve());
    const beforeExecute = jest.fn().mockImplementation((event: Event) =>
      Promise.resolve({
        ...event,
        event_id: '1',
      }),
    );
    const before: Plugin = {
      name: 'plugin:before',
      type: 'before',
      setup: beforeSetup,
      teardown: beforeTeardown,
      execute: beforeExecute,
    };
    const enrichmentSetup = jest.fn().mockReturnValue(Promise.resolve());
    const enrichmentExecute = jest.fn().mockImplementation((event: Event) =>
      Promise.resolve({
        ...event,
        user_id: '2',
      }),
    );
    const enrichment: Plugin = {
      name: 'plugin:enrichment',
      type: 'enrichment',
      setup: enrichmentSetup,
      execute: enrichmentExecute,
    };

    const destinationSetup = jest.fn().mockReturnValue(Promise.resolve());
    const destinationExecute = jest
      .fn()
      // error once
      .mockImplementationOnce((event: Event) => {
        expect(event.event_id).toBe('1');
        expect(event.user_id).toBe('2');
        return Promise.reject({});
      })
      // success for the rest
      .mockImplementation((event: Event) => {
        expect(event.event_id).toBe('1');
        expect(event.user_id).toBe('2');
        return Promise.resolve();
      });
    const destination: Plugin = {
      name: 'plugin:destination',
      type: 'destination',
      setup: destinationSetup,
      execute: destinationExecute,
    };
    // register
    await timeline.register(before, config);
    await timeline.register(enrichment, config);
    await timeline.register(destination, config);

    expect(beforeSetup).toHaveBeenCalledTimes(1);
    expect(enrichmentSetup).toHaveBeenCalledTimes(1);
    expect(destinationSetup).toHaveBeenCalledTimes(1);
    expect(timeline.plugins.length).toBe(3);
    const event = (id: number): Event => ({
      event_type: `${id}:event_type`,
    });
    await Promise.all([
      timeline.push(event(1)).then(() => timeline.push(event(1.1))),
      timeline.push(event(2)).then(() => Promise.all([timeline.push(event(2.1)), timeline.push(event(2.2))])),
      timeline
        .push(event(3))
        .then(() =>
          Promise.all([
            timeline.push(event(3.1)).then(() => Promise.all([timeline.push(event(3.11)), timeline.push(event(3.12))])),
            timeline.push(event(3.2)),
          ]),
        ),
    ]);
    expect(beforeExecute).toHaveBeenCalledTimes(10);
    expect(enrichmentExecute).toHaveBeenCalledTimes(10);
    expect(destinationExecute).toHaveBeenCalledTimes(10);

    // deregister
    await timeline.deregister('plugin:before', config);
    await timeline.deregister('plugin:enrichment', config);
    await timeline.deregister('plugin:destination', config);
    expect(timeline.plugins.length).toBe(0);
  });

  describe('push', () => {
    test('should skip event processing when config is missing', async () => {
      const event = {
        event_type: 'hello',
      };
      const result = timeline.push(event);
      expect(await promiseState(result)).toEqual('pending');
      expect(timeline.queue.length).toBe(1);
    });
  });

  describe('apply', () => {
    test('should handle undefined event', async () => {
      const beforeSetup = jest.fn().mockReturnValueOnce(Promise.resolve());
      const beforeExecute = jest.fn().mockImplementationOnce((event: Event) =>
        Promise.resolve({
          ...event,
          event_id: '1',
        }),
      );
      const before: Plugin = {
        name: 'plugin:before',
        type: 'before',
        setup: beforeSetup,
        execute: beforeExecute,
      };
      await timeline.register(before, config);
      await timeline.apply(undefined);
      await timeline.deregister('plugin:before', config);
      expect(beforeExecute).toHaveBeenCalledTimes(0);
    });

    test("should pass event's extra to plugins", async () => {
      const beforeExecute = jest.fn().mockImplementationOnce((event: Event) => {
        expect(event.extra).toStrictEqual({ 'extra-key': 'extra-value' });
        return Promise.resolve(event);
      });
      const before: Plugin = {
        name: 'plugin:before',
        type: 'before',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: beforeExecute,
      };

      const enrichmentExecute = jest.fn().mockImplementationOnce((event: Event) => {
        expect(event.extra).toStrictEqual({ 'extra-key': 'extra-value' });
        return Promise.resolve(event);
      });
      const enrichment: Plugin = {
        name: 'plugin:enrichment',
        type: 'enrichment',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: enrichmentExecute,
      };

      const destinationExecute = jest.fn().mockImplementationOnce((event: Event) => {
        expect(event.extra).toStrictEqual({ 'extra-key': 'extra-value' });
        return Promise.resolve(event);
      });
      const destination: Plugin = {
        name: 'plugin:destination',
        type: 'destination',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: destinationExecute,
      };

      await timeline.register(before, config);
      await timeline.register(enrichment, config);
      await timeline.register(destination, config);

      const event = {
        event_type: 'some-event',
        extra: { 'extra-key': 'extra-value' },
      };
      const callback = jest.fn();
      await timeline.apply([event, callback]);

      await timeline.deregister('plugin:before', config);
      await timeline.deregister('plugin:enrichment', config);
      await timeline.deregister('plugin:destination', config);

      expect(beforeExecute).toHaveBeenCalledTimes(1);
      expect(enrichmentExecute).toHaveBeenCalledTimes(1);
      expect(destinationExecute).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should stop if a before plugin returns null', async () => {
      const beforeExecute1 = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const beforeExecute2 = jest.fn().mockImplementationOnce(() => {
        return Promise.resolve(null);
      });
      const beforeExecute3 = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const before1: Plugin = {
        name: 'plugin:before:1',
        type: 'before',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: beforeExecute1,
      };
      const before2: Plugin = {
        name: 'plugin:before:2',
        type: 'before',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: beforeExecute2,
      };
      const before3: Plugin = {
        name: 'plugin:before:3',
        type: 'before',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: beforeExecute3,
      };

      const enrichmentExecute = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const enrichment: Plugin = {
        name: 'plugin:enrichment',
        type: 'enrichment',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: enrichmentExecute,
      };

      const destinationExecute = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const destination: Plugin = {
        name: 'plugin:destination',
        type: 'destination',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: destinationExecute,
      };

      await timeline.register(before1, config);
      await timeline.register(before2, config);
      await timeline.register(before3, config);
      await timeline.register(enrichment, config);
      await timeline.register(destination, config);

      const event = {
        event_type: 'some-event',
      };
      const callback = jest.fn();
      await timeline.apply([event, callback]);

      await timeline.deregister('plugin:before:1', config);
      await timeline.deregister('plugin:before:2', config);
      await timeline.deregister('plugin:before:3', config);
      await timeline.deregister('plugin:enrichment', config);
      await timeline.deregister('plugin:destination', config);

      expect(beforeExecute1).toHaveBeenCalledTimes(1);
      expect(beforeExecute2).toHaveBeenCalledTimes(1);
      expect(beforeExecute3).toHaveBeenCalledTimes(0);
      expect(enrichmentExecute).toHaveBeenCalledTimes(0);
      expect(destinationExecute).toHaveBeenCalledTimes(0);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should stop if an enrichment plugin returns null', async () => {
      const beforeExecute = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const before: Plugin = {
        name: 'plugin:before',
        type: 'before',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: beforeExecute,
      };

      const enrichmentExecute1 = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const enrichmentExecute2 = jest.fn().mockImplementationOnce(() => {
        return Promise.resolve(null);
      });
      const enrichmentExecute3 = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const enrichment1: Plugin = {
        name: 'plugin:enrichment:1',
        type: 'enrichment',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: enrichmentExecute1,
      };
      const enrichment2: Plugin = {
        name: 'plugin:enrichment:2',
        type: 'enrichment',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: enrichmentExecute2,
      };
      const enrichment3: Plugin = {
        name: 'plugin:enrichment:3',
        type: 'enrichment',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: enrichmentExecute3,
      };

      const destinationExecute = jest.fn().mockImplementationOnce((event: Event) => {
        return Promise.resolve(event);
      });
      const destination: Plugin = {
        name: 'plugin:destination',
        type: 'destination',
        setup: jest.fn().mockReturnValueOnce(Promise.resolve()),
        execute: destinationExecute,
      };

      await timeline.register(before, config);
      await timeline.register(enrichment1, config);
      await timeline.register(enrichment2, config);
      await timeline.register(enrichment3, config);
      await timeline.register(destination, config);

      const event = {
        event_type: 'some-event',
      };
      const callback = jest.fn();
      await timeline.apply([event, callback]);

      await timeline.deregister('plugin:before', config);
      await timeline.deregister('plugin:enrichment:1', config);
      await timeline.deregister('plugin:enrichment:2', config);
      await timeline.deregister('plugin:enrichment:3', config);
      await timeline.deregister('plugin:destination', config);

      expect(beforeExecute).toHaveBeenCalledTimes(1);
      expect(enrichmentExecute1).toHaveBeenCalledTimes(1);
      expect(enrichmentExecute2).toHaveBeenCalledTimes(1);
      expect(enrichmentExecute3).toHaveBeenCalledTimes(0);
      expect(destinationExecute).toHaveBeenCalledTimes(0);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush', () => {
    test('should flush events', async () => {
      const setup = jest.fn().mockReturnValueOnce(Promise.resolve(undefined));
      const execute = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const flush = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin: DestinationPlugin = {
        name: 'mock',
        type: 'destination',
        setup,
        execute,
        flush,
      };
      await timeline.register(plugin, config);
      void timeline.push(createTrackEvent('a'));
      void timeline.push(createTrackEvent('b'));
      void timeline.push(createTrackEvent('c'));
      void timeline.push(createTrackEvent('d'));
      expect(timeline.queue.length).toBe(4);
      await timeline.flush();
      expect(timeline.queue.length).toBe(0);
      expect(execute).toHaveBeenCalledTimes(4);
      expect(flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('onIdentityChanged', () => {
    test('should call onIdentityChanged() of each plugin', async () => {
      const onIdentityChanged = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin: EnrichmentPlugin = {
        name: 'mock',
        type: 'enrichment',
        onIdentityChanged,
      };
      const mockIdentity = {
        deviceId: 'test-device-id',
        userId: 'test-user-id',
      };
      timeline.plugins.push(plugin);

      timeline.onIdentityChanged(mockIdentity);

      expect(onIdentityChanged).toHaveBeenCalledTimes(1);
      expect(onIdentityChanged).toHaveBeenCalledWith(mockIdentity);
    });
  });

  describe('onSessionIdChanged', () => {
    test('should call onSessionIdChanged() of each plugin', async () => {
      const onSessionIdChanged = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin: EnrichmentPlugin = {
        name: 'mock',
        type: 'enrichment',
        onSessionIdChanged,
      };
      const mockSessionId = 123;
      timeline.plugins.push(plugin);

      timeline.onSessionIdChanged?.(mockSessionId);

      expect(onSessionIdChanged).toHaveBeenCalledTimes(1);
      expect(onSessionIdChanged).toHaveBeenCalledWith(mockSessionId);
    });
  });

  describe('onOptOutChanged', () => {
    test('should call onOptOutChanged() of each plugin', async () => {
      const onOptOutChanged = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin: EnrichmentPlugin = {
        name: 'mock',
        type: 'enrichment',
        onOptOutChanged,
      };
      const mockOptOut = true;
      timeline.plugins.push(plugin);

      timeline.onOptOutChanged?.(mockOptOut);

      expect(onOptOutChanged).toHaveBeenCalledTimes(1);
      expect(onOptOutChanged).toHaveBeenCalledWith(mockOptOut);
    });
  });

  describe('onReset', () => {
    test('should call onReset() of each plugin', async () => {
      const onReset = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin: EnrichmentPlugin = {
        name: 'mock',
        type: 'enrichment',
        onReset,
      };
      timeline.plugins.push(plugin);
      timeline.onReset?.();
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });
});
