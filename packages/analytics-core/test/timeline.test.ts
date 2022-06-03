import { register, deregister, push, apply, flush } from '../src/timeline';
import { AmplitudeDestinationPlugin, Event, Plugin, PluginType } from '@amplitude/analytics-types';
import { OPT_OUT_MESSAGE } from '../src/messages';
import { useDefaultConfig } from './helpers/default';

describe('timeline', () => {
  test('should update event using before/enrichment plugin', async () => {
    const beforeSetup = jest.fn().mockReturnValue(Promise.resolve());
    const beforeExecute = jest.fn().mockImplementation((event: Event) =>
      Promise.resolve({
        ...event,
        event_id: '1',
      }),
    );
    const before: Plugin = {
      name: 'plugin:before',
      type: PluginType.BEFORE,
      setup: beforeSetup,
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
      type: PluginType.ENRICHMENT,
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
      type: PluginType.DESTINATION,
      setup: destinationSetup,
      execute: destinationExecute,
    };
    const config = useDefaultConfig();
    // register
    await register(before, config);
    await register(enrichment, config);
    await register(destination, config);
    expect(beforeSetup).toHaveBeenCalledTimes(1);
    expect(enrichmentSetup).toHaveBeenCalledTimes(1);
    expect(destinationSetup).toHaveBeenCalledTimes(1);
    expect(config.plugins.length).toBe(3);
    const event = (id: number): Event => ({
      event_type: `${id}:event_type`,
    });
    await Promise.all([
      push(event(1), config).then(() => push(event(1.1), config)),
      push(event(2), config).then(() => Promise.all([push(event(2.1), config), push(event(2.2), config)])),
      push(event(3), config).then(() =>
        Promise.all([
          push(event(3.1), config).then(() => Promise.all([push(event(3.11), config), push(event(3.12), config)])),
          push(event(3.2), config),
        ]),
      ),
    ]);
    expect(beforeExecute).toHaveBeenCalledTimes(10);
    expect(enrichmentExecute).toHaveBeenCalledTimes(10);
    expect(destinationExecute).toHaveBeenCalledTimes(10);

    // deregister
    await deregister(before.name, config);
    await deregister(enrichment.name, config);
    await deregister(destination.name, config);
    expect(config.plugins.length).toBe(0);
  });

  describe('push', () => {
    test('should handle opt out', async () => {
      const event = {
        event_type: 'hello',
      };
      const config = useDefaultConfig();
      config.optOut = true;
      const results = await push(event, config);
      expect(results).toEqual({
        event,
        code: 0,
        message: OPT_OUT_MESSAGE,
      });
    });
  });

  describe('apply', () => {
    test('should handle empty queue', async () => {
      const beforeSetup = jest.fn().mockReturnValueOnce(Promise.resolve());
      const beforeExecute = jest.fn().mockImplementationOnce((event: Event) =>
        Promise.resolve({
          ...event,
          event_id: '1',
        }),
      );
      const before: Plugin = {
        name: 'plugin:before',
        type: PluginType.BEFORE,
        setup: beforeSetup,
        execute: beforeExecute,
      };
      const config = useDefaultConfig();
      await register(before, config);
      await apply();
      await deregister(before.name, config);
      expect(beforeExecute).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should call destination flush method', async () => {
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
      const destinationFlush = jest.fn().mockReturnValue(Promise.resolve());
      const destination: AmplitudeDestinationPlugin = {
        name: 'plugin:destination',
        type: PluginType.DESTINATION,
        setup: destinationSetup,
        execute: destinationExecute,
        flush: destinationFlush,
      };
      const config = useDefaultConfig();
      await register(destination, config);
      await flush(config);
      expect(destinationFlush).toHaveBeenCalledTimes(1);
    });

    test('should not throw error if destination plugin does not have flush method', async () => {
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
        type: PluginType.DESTINATION,
        setup: destinationSetup,
        execute: destinationExecute,
      };
      const config = useDefaultConfig();
      await register(destination, config);
      await expect(flush(config)).resolves.not.toThrowError();
    });
  });
});
