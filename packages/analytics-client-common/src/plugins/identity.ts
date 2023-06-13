import { BeforePlugin, Config, Event } from '@amplitude/analytics-types';
import { getAnalyticsConnector } from '../analytics-connector';

export class IdentityEventSender implements BeforePlugin {
  name = 'identity';
  type = 'before' as const;

  identityStore = getAnalyticsConnector().identityStore;

  async execute(context: Event): Promise<Event> {
    const userProperties = context.user_properties as Record<string, any>;
    if (userProperties) {
      this.identityStore.editIdentity().updateUserProperties(userProperties).commit();
    }
    return context;
  }

  async setup(config: Config) {
    if (config.instanceName) {
      this.identityStore = getAnalyticsConnector(config.instanceName).identityStore;
    }
  }
}
