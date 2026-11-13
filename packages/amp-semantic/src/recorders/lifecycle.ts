import type { SemanticPayloads, SemanticRecorder } from '../types';

/** Browser lifecycle boundaries preserve evidence for later interval derivation. */
export const lifecycleRecorder: SemanticRecorder = {
  families: ['lifecycle'],
  setup(context) {
    const { document, window } = context.host;
    const listen = (target: EventTarget, name: string, type: SemanticPayloads['lifecycle']['type']) => {
      const callback = (event: Event) => {
        context.emit('lifecycle', {
          type: name === 'pageshow' && (event as PageTransitionEvent).persisted ? 'pageshow_bfcache' : type,
        });
      };
      // Capture pagehide before the host flushes its replay queue.
      target.addEventListener(name, callback, true);
      context.onCleanup(() => target.removeEventListener(name, callback, true));
    };
    listen(window, 'pagehide', 'pagehide');
    listen(window, 'pageshow', 'pageshow');
    listen(document, 'freeze', 'freeze');
    listen(document, 'resume', 'resume');
    return () => undefined;
  },
};
