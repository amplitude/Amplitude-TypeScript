import type { SemanticRecorder } from '../types';
import { urlTemplate } from '../url';

/** Consumes accepted URL plugin events without adding browser observers. */
export const navigationRecorder: SemanticRecorder = {
  families: ['navigation'],
  setup(context) {
    return context.on('url', ({ url, timestamp }) => {
      if (!url.trim() || !context.canEmit('navigation')) return;
      context.emit('navigation', { url: urlTemplate(url, context.host.window.location.href) }, timestamp);
    });
  },
};
