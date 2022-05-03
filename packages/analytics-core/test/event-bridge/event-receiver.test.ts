import { AnalyticsEventReceiver } from '../../src/event-bridge/event-receiver';
import { useDefaultConfig } from '../helpers/default';
import { Config } from '../../src/config';
import { EventChannel } from '../../src/event-bridge/event-channel';

describe('AnalyticsEventReceiver', () => {
  describe('receive', () => {
    test('should track successfully', () => {
      const config = new Config(useDefaultConfig());
      config.loggerProvider = {
        disable: jest.fn(),
        enable: jest.fn(),
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };
      const track = jest.fn().mockReturnValueOnce(Promise.resolve());
      const client = {
        config,
        track,
      };
      const receiver = new AnalyticsEventReceiver(client);
      receiver.receive(EventChannel.EVENT, {
        event_type: 'Button Clicked',
      });
      expect(track).toHaveBeenCalledTimes(1);
    });
  });
});
