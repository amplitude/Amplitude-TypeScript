import { IdentityEventSender } from '../../src/plugins/identity';
import { IConfig } from '../../src/config';
import { getAnalyticsConnector } from '../../src/analytics-connector';

describe('identity', () => {
  describe('execute', () => {
    beforeEach(() => {
      getAnalyticsConnector().identityStore.setIdentity({ userProperties: {} });
    });

    test('should set identity in analytics connector on identify with default instance', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({} as IConfig);
      const event = {
        event_type: '$identify',
        user_properties: {
          $set: { k: 'v' },
        },
      };
      const result = await plugin.execute(event);
      const identity = getAnalyticsConnector().identityStore.getIdentity();
      expect(result).toEqual(event);
      expect(identity.userProperties).toEqual({ k: 'v' });
    });

    test('should set identity in analytics connector on identify with instance name', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({
        instanceName: 'env',
      } as IConfig);
      const event = {
        event_type: '$identify',
        user_properties: {
          $set: { k: 'v' },
        },
      };
      const result = await plugin.execute(event);
      const identity = getAnalyticsConnector('env').identityStore.getIdentity();
      expect(result).toEqual(event);
      expect(identity.userProperties).toEqual({ k: 'v' });
    });

    test('should do nothing on track event', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({} as IConfig);
      const event = {
        event_type: 'test_track',
      };
      const result = await plugin.execute(event);
      expect(result).toEqual(event);
      const emptyIdentity = { userProperties: {} };
      const identity = getAnalyticsConnector().identityStore.getIdentity();
      expect(identity).toEqual(emptyIdentity);
    });
  });
});
