import {
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  EventsManagerWithType,
} from '../typings/session-replay';

/**
 * "Registers" events managers internally. When an event is added this class routes the event to the correct
 * manager. For all send or flush methods this will invoke the event for all registered managers.
 */
export class MultiEventManager<EventType, EventDataType>
  implements AmplitudeSessionReplayEventsManager<EventType, EventDataType>
{
  private managers: Map<EventType, AmplitudeSessionReplayEventsManager<EventType, EventDataType>>;

  constructor(...managers: EventsManagerWithType<EventType, EventDataType>[]) {
    const managersMap = new Map<EventType, AmplitudeSessionReplayEventsManager<EventType, EventDataType>>();
    managers.forEach((t) => {
      managersMap.set(t.name, t.manager);
    });
    this.managers = managersMap;
  }

  async sendStoredEvents(opts: { deviceId: string }): Promise<void> {
    const promises: Promise<void>[] = [];
    this.managers.forEach((manager) => {
      promises.push(manager.sendStoredEvents(opts));
    });
    await Promise.all(promises);
  }

  addEvent({
    sessionId,
    event,
    deviceId,
  }: {
    sessionId: number;
    event: { type: EventType; data: EventDataType };
    deviceId: string;
  }): void {
    this.managers.get(event.type)?.addEvent({ sessionId, event, deviceId });
  }

  sendCurrentSequenceEvents({ sessionId, deviceId }: { sessionId: number; deviceId: string }): void {
    this.managers.forEach((manager) => {
      manager.sendCurrentSequenceEvents({ sessionId, deviceId });
    });
  }

  async flush(useRetry?: boolean | undefined): Promise<void> {
    const promises: Promise<void>[] = [];
    this.managers.forEach((manager) => {
      promises.push(manager.flush(useRetry));
    });
    await Promise.all(promises);
  }
}
