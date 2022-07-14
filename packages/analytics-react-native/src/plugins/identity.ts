import { BeforePlugin, PluginType, Event, Config } from '@amplitude/analytics-types';
import { AnalyticsConnector } from '@amplitude/analytics-connector';

export class IdentityEventSender implements BeforePlugin {
  name = 'identity';
  type = PluginType.BEFORE as const;

  identityStore = AnalyticsConnector.getInstance('$default_instance').identityStore;

  async execute(context: Event): Promise<Event> {
    const userProperties = context.user_properties as Record<string, any>;
    if (userProperties) {
      this.identityStore.editIdentity().setUserProperties(userProperties).commit();
    }
    return context;
  }

  setup(_: Config): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}
