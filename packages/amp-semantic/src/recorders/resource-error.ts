import type { SemanticPayloads, SemanticRecorder } from '../types';

type Payload = SemanticPayloads['resource-error'];
type Pending = { element: Element; rt: Payload['rt']; path?: string; count: number };
const WINDOW_MS = 500;
const MAX_PENDING = 100;
const MAX_COUNT = 65535;

/** Observe failures only: no requests, DOM scans, or network API patches. */
export const resourceErrorRecorder: SemanticRecorder = {
  families: ['resource-error'],
  setup(context) {
    const { document, window } = context.host;
    const { helpers } = context;
    let active = true;
    let timer: number | undefined;
    let pending: Pending[] = [];
    let fontsFailed = 0;
    const fonts = document.fonts;
    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const flush = () => {
      clearTimer();
      const batch = pending;
      const fontCount = fontsFailed;
      pending = [];
      fontsFailed = 0;
      if (!active || !context.enabled('resource-error')) return;
      const groups = new Map<string, Payload>();
      for (const item of batch) {
        // Re-read privacy and container names at emission; detached nodes lose masking ancestry.
        if (!item.element.isConnected || helpers.blocked(item.element)) continue;
        const container = helpers.container(item.element);
        const payload: Payload = {
          rt: item.rt,
          count: item.count,
          ...(item.path ? { path: item.path } : {}),
          ...(container ? { container } : {}),
        };
        const key = JSON.stringify([payload.rt, payload.path, payload.container]);
        const previous = groups.get(key);
        if (previous) previous.count = Math.min(MAX_COUNT, previous.count + payload.count);
        else groups.set(key, payload);
      }
      if (fontCount) context.emit('resource-error', { rt: 'font', count: fontCount });
      for (const payload of groups.values()) context.emit('resource-error', payload);
    };
    const schedule = () => {
      if (document.visibilityState === 'hidden') flush();
      else if (timer === undefined) timer = window.setTimeout(flush, WINDOW_MS);
    };
    const resourcePath = (value: string): string | undefined => {
      if (!value) return undefined;
      try {
        const url = new URL(value, document.baseURI);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
        // Resource fragments are not SPA routes. Never include queries or origins.
        const path = helpers.url(url.origin + url.pathname);
        return path.length <= 200 ? path : undefined;
      } catch {
        return undefined;
      }
    };
    const onError = (event: Event) => {
      if (!active || !context.enabled('resource-error')) return;
      const element = event.target as Element | null;
      if (!element || element.nodeType !== 1 || helpers.blocked(element)) return;
      let rt: Payload['rt'];
      let url: string;
      if (element.tagName === 'IMG') {
        rt = 'img';
        url = (element as HTMLImageElement).currentSrc || element.getAttribute('src') || '';
      } else if (element.tagName === 'SCRIPT' && element.hasAttribute('src')) {
        rt = 'script';
        url = element.getAttribute('src') || '';
      } else if (element.tagName === 'LINK' && (element as HTMLLinkElement).relList.contains('stylesheet')) {
        rt = 'css';
        url = element.getAttribute('href') || '';
      } else return;
      const path = resourcePath(url);
      const existing = pending.find((item) => item.element === element && item.rt === rt && item.path === path);
      if (existing) existing.count = Math.min(MAX_COUNT, existing.count + 1);
      else {
        if (pending.length >= MAX_PENDING) flush();
        pending.push({ element, rt, path, count: 1 });
      }
      schedule();
    };
    const onFontError = (event: Event) => {
      if (!active || !context.enabled('resource-error')) return;
      const faces = (event as Event & { fontfaces?: readonly FontFace[] }).fontfaces;
      if (!faces?.length) return;
      // FontFaceSet provides failed faces, not their source URLs or affected DOM containers.
      fontsFailed = Math.min(MAX_COUNT, fontsFailed + faces.length);
      schedule();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const cleanup = () => {
      active = false;
      clearTimer();
      pending = [];
      fontsFailed = 0;
      document.removeEventListener('error', onError, true);
      document.removeEventListener('visibilitychange', onVisibility, true);
      window.removeEventListener('pagehide', flush, true);
      fonts?.removeEventListener('loadingerror', onFontError);
    };
    context.onCleanup(cleanup);
    document.addEventListener('error', onError, true);
    document.addEventListener('visibilitychange', onVisibility, true);
    window.addEventListener('pagehide', flush, true);
    fonts?.addEventListener('loadingerror', onFontError);
    return cleanup;
  },
};
