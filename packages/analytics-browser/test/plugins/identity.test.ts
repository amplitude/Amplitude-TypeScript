import { IdentityEventSender } from '../../src/plugins/identity';
import { Config } from '@amplitude/analytics-types';
import { getAnalyticsConnector } from '../../src/utils/analytics-connector';

describe('identity', () => {
  describe('execute', () => {
    beforeEach(() => {
      getAnalyticsConnector().identityStore.setIdentity({ userProperties: {} });
    });

    test('should set identity in analytics connector on identify', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({} as Config);
      const event = {
        event_type: '$identify',
        user_properties: {
          $set: { k: 'v' },
        },
      };
      void (await plugin.execute(event));
      const identity = getAnalyticsConnector().identityStore.getIdentity();
      expect(identity.userProperties).toEqual({ k: 'v' });
    });

    test('should not modify event on identify', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({} as Config);
      const event = {
        event_type: '$identify',
        user_properties: {
          $set: { k: 'v' },
        },
      };
      const result = await plugin.execute(event);
      expect(result).toEqual(event);
    });

    test('should do nothing on track event', async () => {
      const plugin = new IdentityEventSender();
      await plugin.setup({} as Config);
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
