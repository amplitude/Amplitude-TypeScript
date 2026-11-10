import {
  AmplitudeCore,
  BrowserClient,
  BrowserConfig,
  DestinationPlugin,
  Event,
  Result,
  returnWrapper,
} from '@amplitude/analytics-core';

/** Reuse the SDK's delivery queues without replaying an already-enriched page view. */
export const createSnapshotClient = (client: BrowserClient, config: BrowserConfig): BrowserClient => {
  const send = (event: Event): Promise<Result> => {
    if (config.optOut) return Promise.resolve({ event, code: 0, message: 'Opt-out is enabled' });
    // Browser SDK clients expose their core timeline. Use every installed destination,
    // preserving normal queues, storage, retries and additional destination plugins.
    const destinations = (client as unknown as AmplitudeCore).timeline.plugins.filter(
      (plugin): plugin is DestinationPlugin => plugin.type === 'destination',
    );
    return Promise.all(
      destinations.map((destination) =>
        destination.execute({ ...event }).catch((error: unknown) => ({ event, code: 0, message: String(error) })),
      ),
    ).then((results) => results[0] ?? { event, code: 100, message: 'No destination plugins are installed' });
  };
  const snapshotClient = Object.create(client) as BrowserClient;
  // Heartbeat always calls track(event_type, event_properties, eventOptions).
  snapshotClient.track = (eventType, eventProperties, eventOptions) =>
    returnWrapper(
      send({
        ...eventOptions,
        event_type: eventType as string,
        event_properties: eventProperties,
      }),
    );
  snapshotClient.flush = () => client.flush();
  return snapshotClient;
};
