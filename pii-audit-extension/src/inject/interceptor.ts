import { AUDIT_FLAG } from '../shared/messages';
import { isIngestUrl, isRemoteConfigUrl, extractEvents } from './amplitude-endpoints';
import { forceAutocaptureOn } from './remote-config';

if (sessionStorage.getItem(AUDIT_FLAG) === '1') {
  const post = (payload: any) => window.postMessage({ __piiAudit: true, ...payload }, '*');
  const okJson = (obj: any) =>
    new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (isIngestUrl(url)) {
      const body = (init?.body ?? (input instanceof Request ? await input.clone().text() : '')) as string;
      post({ kind: 'network', events: extractEvents(typeof body === 'string' ? body : '') });
      return okJson({
        code: 200,
        events_ingested: 0,
        payload_size_bytes: 0,
        server_upload_time: Date.now(),
      });
    }
    if (isRemoteConfigUrl(url)) {
      const res = await origFetch(input as any, init);
      try {
        return okJson(forceAutocaptureOn(await res.clone().json()));
      } catch {
        return res;
      }
    }
    return origFetch(input as any, init);
  };

  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon)
    navigator.sendBeacon = (url: string, data?: BodyInit | null) => {
      if (isIngestUrl(url)) {
        post({ kind: 'network', events: extractEvents(typeof data === 'string' ? data : '') });
        return true;
      }
      return origBeacon(url, data);
    };

  const XO = XMLHttpRequest.prototype.open,
    XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: any, m: string, u: string, ...r: any[]) {
    this.__url = u;
    return XO.apply(this, [m, u, ...r] as any);
  };
  XMLHttpRequest.prototype.send = function (this: any, body?: any) {
    if (this.__url && isIngestUrl(this.__url)) {
      post({ kind: 'network', events: extractEvents(typeof body === 'string' ? body : '') });
      Object.defineProperty(this, 'status', { value: 200 });
      this.dispatchEvent(new Event('load'));
      return;
    }
    return XS.apply(this, [body]);
  };
  post({ kind: 'audit-active' });
  console.log('[pii-audit] interceptor active');
}
