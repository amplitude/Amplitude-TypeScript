import type { RecorderContext, SemanticRecorder } from '../types';

function captureContext(context: RecorderContext): void {
  if (!context.canEmit('context')) return;
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

/** Context is refreshed only when the host accepts a full replay snapshot. */
export const contextRecorder: SemanticRecorder = {
  families: ['context'],
  setup(context) {
    return context.on('snapshot', () => captureContext(context));
  },
};
