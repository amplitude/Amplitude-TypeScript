import { Types } from '@amplitude/analytics-react-native';

export type EventCapture = {
  events: Types.Event[];
  /** Enrichment plugin that appends each processed event to `events`. */
  plugin: {
    name: string;
    type: 'enrichment';
    setup: () => Promise<void>;
    execute: (event: Types.Event) => Promise<Types.Event>;
  };
  waitForEvents: (count: number, timeoutMs?: number) => Promise<void>;
  clear: () => void;
};

/**
 * Captures SDK events via an enrichment plugin.
 * Add `plugin` before init (queued) so early events like session_start are seen.
 */
export function createEventCapture(name = 'event-capture'): EventCapture {
  const events: Types.Event[] = [];

  return {
    events,
    plugin: {
      name,
      type: 'enrichment',
      setup: async () => undefined,
      execute: async (event: Types.Event) => {
        events.push(event);
        return event;
      },
    },
    waitForEvents(count: number, timeoutMs = 3000): Promise<void> {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
          if (events.length >= count) {
            resolve();
            return;
          }
          if (Date.now() - started > timeoutMs) {
            reject(
              new Error(
                `Timed out waiting for ${count} events; got ${events.length}: ${events
                  .map((e) => e.event_type)
                  .join(', ')}`,
              ),
            );
            return;
          }
          setTimeout(tick, 10);
        };
        tick();
      });
    },
    clear() {
      events.length = 0;
    },
  };
}
