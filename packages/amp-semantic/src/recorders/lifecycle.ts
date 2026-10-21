import type { Cleanup, RecorderContext, SemanticPayloads, SemanticRecorder } from '../types';

const VISIBILITY_SETTLE_MS = 50;

function captureContext(context: RecorderContext): void {
  const { host } = context;
  const { document, window: scope } = host;
  const css = { total: 0, inlined: 0, unreadable: 0 };
  for (const sheet of Array.from(document.styleSheets)) {
    css.total++;
    try {
      // Reading cssRules can throw for cross-origin stylesheets.
      void sheet.cssRules;
      if (host.inlineStylesheet !== false) css.inlined++;
    } catch {
      css.unreadable++;
    }
  }
  const coarse = typeof scope.matchMedia === 'function' && scope.matchMedia('(pointer:coarse)').matches;
  const device = coarse && scope.innerWidth < 768 ? 'mobile' : coarse && scope.innerWidth < 1024 ? 'tablet' : 'desktop';
  const caps = context.dropped();
  context.emit('context', {
    sdk: host.sdk,
    mask: host.getPrivacy().defaultMaskLevel ?? 'medium',
    css,
    viewport: { w: scope.innerWidth, h: scope.innerHeight },
    device,
    language: scope.navigator.language,
    visibility_state: document.visibilityState === 'hidden' ? 'hidden' : 'visible',
    focused: document.hasFocus(),
    user_agent: scope.navigator.userAgent,
    analytics_sdk: host.getAnalyticsContext?.() ?? { present: false, autocapture: [] },
    ...(Object.keys(caps).length ? { caps_hit: caps } : {}),
  });
}

/** Host lifecycle and browser lifecycle are independent families with independent teardown. */
export const lifecycleRecorder: SemanticRecorder = {
  families: ['context', 'recording', 'visibility', 'lifecycle'],
  setup(context) {
    const cleanups: Cleanup[] = [];
    const { document, window: scope } = context.host;
    if (context.enabled('context')) {
      cleanups.push(context.on('snapshot', () => captureContext(context)));
    }
    if (context.enabled('recording')) {
      cleanups.push(context.on('recording', (signal) => context.emit('recording', signal)));
    }
    if (context.enabled('visibility')) {
      const readState = () => ({
        state: document.visibilityState === 'hidden' ? ('hidden' as const) : ('visible' as const),
        focused: document.hasFocus(),
      });
      let previous = readState();
      let pending: SemanticPayloads['visibility'] | undefined;
      let timer: number | undefined;
      const same = (left: typeof previous, right: typeof previous) =>
        left.state === right.state && left.focused === right.focused;
      const cancelPending = () => {
        if (timer !== undefined) scope.clearTimeout(timer);
        timer = undefined;
        pending = undefined;
      };
      const emit = (payload: SemanticPayloads['visibility']) => {
        previous = payload;
        context.emit('visibility', payload);
      };
      const observe = (trigger: SemanticPayloads['visibility']['trigger']) => {
        const current = { ...readState(), trigger };
        // Repeated notifications must not restart the settling window.
        if (same(current, pending ?? previous)) return;
        cancelPending();
        // A transient blur/focus pair that returns to the last emitted state is noise.
        if (same(current, previous)) return;
        if (current.state === 'hidden') {
          // Do not depend on a timer surviving backgrounding or page suspension.
          emit(current);
        } else {
          pending = current;
          timer = scope.setTimeout(() => {
            const settled = pending;
            cancelPending();
            if (settled) emit(settled);
          }, VISIBILITY_SETTLE_MS);
        }
      };
      const onVisibility = () => observe('visibilitychange');
      const onFocus = (event: Event) => {
        if (event.target === scope) observe('focus');
      };
      const onBlur = (event: Event) => {
        if (event.target === scope) observe('blur');
      };
      document.addEventListener('visibilitychange', onVisibility, true);
      scope.addEventListener('focus', onFocus);
      scope.addEventListener('blur', onBlur);
      scope.addEventListener('pagehide', cancelPending, true);
      cleanups.push(() => {
        cancelPending();
        scope.removeEventListener('pagehide', cancelPending, true);
        document.removeEventListener('visibilitychange', onVisibility, true);
        scope.removeEventListener('focus', onFocus);
        scope.removeEventListener('blur', onBlur);
      });
    }
    if (context.enabled('lifecycle')) {
      const listen = (target: EventTarget, name: string, type: SemanticPayloads['lifecycle']['type']) => {
        const callback = (event: Event) => {
          context.emit('lifecycle', {
            type: name === 'pageshow' && (event as PageTransitionEvent).persisted ? 'pageshow_bfcache' : type,
          });
        };
        // Capture phase ensures pagehide is emitted before the host flushes its replay queue.
        target.addEventListener(name, callback, true);
        cleanups.push(() => target.removeEventListener(name, callback, true));
      };
      listen(scope, 'pagehide', 'pagehide');
      listen(scope, 'pageshow', 'pageshow');
      listen(document, 'freeze', 'freeze');
      listen(document, 'resume', 'resume');
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  },
};
