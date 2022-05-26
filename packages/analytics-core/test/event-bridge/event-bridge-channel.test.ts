import { EventBridgeChannel } from '../../src/event-bridge/event-bridge-channel';

describe('EventBridgeChannel', () => {
  describe('sendEvent', () => {
    test('should send event', () => {
      const eventBridge = new EventBridgeChannel('channel');
      const event1 = {
        event_type: 'event_type',
      };
      const event2 = {
        event_type: 'event_type',
      };
      const receiver1 = {
        receive: jest.fn(),
      };
      const receiver2 = {
        receive: jest.fn(),
      };

      // send without receiver
      eventBridge.sendEvent(event1);
      expect(receiver1.receive).toHaveBeenCalledTimes(0);
      expect(receiver2.receive).toHaveBeenCalledTimes(0);

      // register receiver
      eventBridge.setReceiver(receiver1);
      expect(receiver1.receive).toHaveBeenCalledTimes(1);

      // register receiver, but not accepted
      eventBridge.setReceiver(receiver2);
      expect(receiver2.receive).toHaveBeenCalledTimes(0);

      // send with receiver
      eventBridge.sendEvent(event2);
      expect(receiver1.receive).toHaveBeenCalledTimes(2);
      expect(receiver2.receive).toHaveBeenCalledTimes(0);
    });
  });
});
