import type { SemanticRecorder } from '../types';

/** Reuses host URL observations; no history patches, listeners, polling, or page scans. */
export const navigationRecorder: SemanticRecorder = {
  families: ['navigation'],
  setup(context) {
    return context.on('url', ({ url, timestamp }) => {
      if (!url.trim() || !context.canEmit('navigation')) return;
      // The host applies its URL privacy rules first; this removes queries/origins
      // and templates identifier-shaped segments just like interaction URLs.
      context.emit('navigation', { url: context.helpers.url(url) }, timestamp);
    });
  },
};
