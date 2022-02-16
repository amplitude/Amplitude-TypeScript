import { Event, Plugin, PluginType, Config } from '@amplitude/analytics-types';
import * as ConfigFactory from '../src/config';
import { register, deregister, plugins, push, apply } from '../src/timeline';

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
        return Promise.reject();
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

    // register
    await register(before);
    await register(enrichment);
    await register(destination);
    expect(beforeSetup).toHaveBeenCalledTimes(1);
    expect(enrichmentSetup).toHaveBeenCalledTimes(1);
    expect(destinationSetup).toHaveBeenCalledTimes(1);
    expect(plugins.length).toBe(3);
    const event = (id: number): Event => ({
      event_type: `${id}:event_type`,
    });
    const config: Config = ConfigFactory.createConfig('apikey', 'userid');
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
    await deregister(before.name);
    await deregister(enrichment.name);
    await deregister(destination.name);
    expect(plugins.length).toBe(0);
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
      await register(before);
      await apply();
      await deregister(before.name);
      expect(beforeExecute).toHaveBeenCalledTimes(0);
    });
  });
});
