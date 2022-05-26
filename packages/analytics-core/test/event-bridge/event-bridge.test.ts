import { EventBridge } from '../../src/event-bridge/event-bridge';
import * as EventBridgeChannelModule from '../../src/event-bridge/event-bridge-channel';

describe('EventBridge', () => {
  describe('sendEvent', () => {
    test('should send event', () => {
      const sendEvent = jest.fn();
      const setReceiver = jest.fn();
      jest.spyOn(EventBridgeChannelModule, 'EventBridgeChannel').mockReturnValueOnce({
        channel: 'channel',
        queue: [],
        receiver: undefined,
        sendEvent,
        setReceiver,
      });
      const eventBridge = new EventBridge();

      // creates new bridge for channel
      eventBridge.sendEvent('channel', { event_type: 'event_type' });
      expect(sendEvent).toHaveBeenCalledTimes(1);

      // reuses existing bridge for channel
      eventBridge.sendEvent('channel', { event_type: 'event_type' });
      expect(sendEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('setReceiver', () => {
    test('should set receiver', () => {
      const sendEvent = jest.fn();
      const setReceiver = jest.fn();
      jest.spyOn(EventBridgeChannelModule, 'EventBridgeChannel').mockReturnValueOnce({
        channel: 'channel',
        queue: [],
        receiver: undefined,
        sendEvent,
        setReceiver,
      });
      const eventBridge = new EventBridge();
      const receiver = {
        receive: jest.fn(),
      };

      // creates new bridge for channel
      eventBridge.setReceiver('channel', receiver);
      expect(setReceiver).toHaveBeenCalledTimes(1);

      // reuses existing bridge for channel
      eventBridge.setReceiver('channel', receiver);
      expect(setReceiver).toHaveBeenCalledTimes(2);
    });
  });
});
