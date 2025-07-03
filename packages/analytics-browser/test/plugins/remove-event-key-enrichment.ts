import { EnrichmentPlugin } from '@amplitude/analytics-types';
import { BaseEvent } from '@amplitude/analytics-types/src';

type KeyOfEvent = keyof BaseEvent;

/**
 * This plugin enriches all events by removing a list of keys from the
 * event payload. This plugin is helpful in cases where users prefer not to use default
 * values set by the @amplitude/analytics-browser library, for example:
 * - `event.time`
 * - `event.idfa`
 * - `event.idva`
 * - `event.ip`
 *
 * @param keysToRemove
 * @returns EnrichmentPlugin
 */
export const removeEventKeyEnrichment = (keysToRemove: KeyOfEvent[] = []): EnrichmentPlugin => {
  return {
    name: 'remove-event-key-enrichment',
    type: 'enrichment',
    setup: async () => undefined,
    execute: async (event) => {
      for (var key of keysToRemove) {
        delete event[key];
      }
      return event;
    },
  };
};

/**
 * This plugin enriches all events by removing `event.time` from all events.
 * `event.time` uses `Date.now()` which is controlled by the device where the browser runs on.
 * The device clock can be easily manipulated yielding events having unreasonable time values.
 * With `event.time` being `undefined`, the time of the event is determined when the event was sent
 * successfully by the browser ("Client Upload Time"), determined by the server clock, rather than
 * when the event actually occurred. On majority of the cases, "Client Upload Time" can be
 * off by up to the configured `config.flushIntervalMillis`. By default `config.flushIntervalMillis`
 * is set to 1000 milliseconds. In rare cases where initial request to Amplitude fails due to
 * bad payload, throttled request, server error, etc, the time difference can be extended.
 */
export const removeTimeEnrichment = removeEventKeyEnrichment(['time']);
