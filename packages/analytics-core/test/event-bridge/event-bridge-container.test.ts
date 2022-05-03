import { EventBridgeContainer } from '../../src/event-bridge/event-bridge-container';
import * as EventBridgeModule from '../../src/event-bridge/event-bridge';

describe('EventBridgeContainer', () => {
  beforeEach(() => {
    EventBridgeContainer.instances = {};
  });

  describe('getInstance', () => {
    test('should create and reuse existing instance', () => {
      const eventBridge = {
        eventBridgeChannels: {},
        sendEvent: jest.fn(),
        setReceiver: jest.fn(),
      };
      jest.spyOn(EventBridgeModule, 'EventBridge').mockReturnValueOnce(eventBridge);
      expect(Object.keys(EventBridgeContainer.instances).length).toBe(0);
      // creates new instance
      expect(EventBridgeContainer.getInstance('default')).toBe(eventBridge);
      expect(Object.keys(EventBridgeContainer.instances).length).toBe(1);

      // reuses existing instance
      expect(EventBridgeContainer.getInstance('default')).toBe(eventBridge);
      expect(Object.keys(EventBridgeContainer.instances).length).toBe(1);
    });
  });
});
