import { Config, CoreClient, Event, EventBridgeReceiver } from '@amplitude/analytics-types';
import { EventChannel } from './event-channel';

export class AnalyticsEventReceiver implements EventBridgeReceiver {
  constructor(private client: CoreClient<Config>) {}

  receive(_channel: EventChannel, event: Event) {
    this.client.config.loggerProvider.log(`Receive event from event bridge ${event.event_type}`);
    this.client
      .track({
        event_type: event.event_type,
        event_properties: event.event_properties,
        user_properties: event.user_properties,
        groups: event.groups,
        group_properties: event.group_properties,
      })
      // Due to non-awaitable async interface, code is unreachable in test environment
      .catch(
        /* istanbul ignore next */ (error) => {
          this.client.config.loggerProvider.error(error);
        },
      );
  }
}
