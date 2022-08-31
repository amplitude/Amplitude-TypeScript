import { BeforePlugin, Config, Event, PluginType } from '@amplitude/analytics-types';
import { getAnalyticsConnector } from '../analytics-connector';

export class IdentityEventSender implements BeforePlugin {
  name = 'identity';
  type = PluginType.BEFORE as const;

  identityStore = getAnalyticsConnector().identityStore;

  async execute(context: Event): Promise<Event> {
    const userProperties = context.user_properties as Record<string, any>;
    if (userProperties) {
      this.identityStore.editIdentity().updateUserProperties(userProperties).commit();
    }
    return context;
  }

  setup(_: Config): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}
