import { createInstance } from '@amplitude/analytics-browser';
import { EnrichmentPlugin, PluginType } from '@amplitude/analytics-types';
import { BaseEvent } from '@amplitude/analytics-types/src';

type KeyOfEvent = keyof BaseEvent;

/**
 * This is an example plugin that enriches all events by removing a list of keys from the
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
    type: PluginType.ENRICHMENT,
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
 * This is an example plugin that enriches all events by removing `event.time` from all events.
 * `event.time` uses `Date.now()` which is controlled by the device where the browser runs on.
 * With `event.time` being `undefined`, the time of the event is determined when the event was sent
 * by the browser, determined by the server clock, rather then when the event occurred which can be
 * off by up to the configured `config.flushIntervalMillis`. By default `config.flushIntervalMillis`
 * is set to 1000 milliseconds.
 */
const removeTimeEnrichment = removeEventKeyEnrichment(['time']);

const instance = createInstance();

/**
 * IMPORTANT: install plugin before calling init to make sure plugin is added by the time
 * init function is called, and events are flushed.
 */
instance.add(removeTimeEnrichment);

// initialize sdk
instance.init('API_KEY');
