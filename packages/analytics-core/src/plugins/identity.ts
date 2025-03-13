import { BeforePlugin } from '../types/plugin';
import { IConfig } from '../config';
import { Event } from '../types/event/event';
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

  async setup(config: IConfig) {
    if (config.instanceName) {
      this.identityStore = getAnalyticsConnector(config.instanceName).identityStore;
    }
  }
}
