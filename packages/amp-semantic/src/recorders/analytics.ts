import type { SemanticPayloads, SemanticRecorder } from '../types';

const EVENT_TYPES = new Set([
  '[Amplitude] Dead Click',
  '[Amplitude] Rage Click',
  '[Amplitude] Error Click',
  '[Amplitude] Thrashed Cursor',
]);
const NUMERIC_PROPERTIES = ['[Amplitude] Clicks', '[Amplitude] Begin Time', '[Amplitude] End Time'];
const ELEMENT_TEXT = '[Amplitude] Element Text';
const ELEMENT_TAG = '[Amplitude] Element Tag';
const PAGE_PATH = '[Amplitude] Page Path';

/**
 * Hosts must notify `analytics` only after the analytics pipeline accepts the event.
 * This recorder never subscribes to an SDK's pre-enrichment or pre-filtering hook.
 */
export const analyticsRecorder: SemanticRecorder = {
  families: ['amp-event'],
  setup(context) {
    if (!context.enabled('amp-event')) return () => undefined;
    let lastClick: { timestamp: number; id: number | null; name: string | null } | undefined;
    const stopClicks = context.subscribe((event) => {
      if (event.name === 'click') {
        lastClick = { timestamp: event.timestamp, id: event.payload.id, name: event.payload.name };
      }
    });
    const stopAnalytics = context.on('analytics', (event) => {
      if (!context.enabled('amp-event') || !EVENT_TYPES.has(event.eventType)) return;
      const { helpers } = context;
      const element = event.element;
      if (element && helpers.blocked(element)) return;
      const source = event.properties;
      const props: SemanticPayloads['amp-event']['props'] = {};
      let text: string | null = null;
      const rawText = source[ELEMENT_TEXT];
      if (typeof rawText === 'string') {
        // A raw SDK text property may contain text from descendants. Check the full
        // source subtree before accepting a string that bypasses tree traversal.
        if (element && helpers.text(element) !== null) text = helpers.text(element, rawText);
        props[ELEMENT_TEXT] = text;
      }
      const rawTag = source[ELEMENT_TAG];
      if (element) props[ELEMENT_TAG] = element.tagName.toLowerCase();
      else if (typeof rawTag === 'string' && /^[a-z][a-z0-9-]{0,59}$/i.test(rawTag))
        props[ELEMENT_TAG] = rawTag.toLowerCase();
      for (const property of NUMERIC_PROPERTIES) {
        const value = source[property];
        if (typeof value === 'number' && Number.isFinite(value)) props[property] = value;
      }
      const rawPath = source[PAGE_PATH];
      if (typeof rawPath === 'string') props[PAGE_PATH] = helpers.url(rawPath);
      const age = lastClick ? context.now() - lastClick.timestamp : Infinity;
      const id = text !== null && lastClick && age >= 0 && age <= 3000 && lastClick.name === text ? lastClick.id : null;
      context.emit('amp-event', {
        event_type: event.eventType,
        insert_id: typeof event.insertId === 'string' ? event.insertId : null,
        id,
        props,
      });
    });
    return () => {
      stopAnalytics();
      stopClicks();
      lastClick = undefined;
    };
  },
};
