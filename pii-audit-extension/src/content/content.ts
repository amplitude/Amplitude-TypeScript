import { AUDIT_FLAG, type Msg } from '../shared/messages';
import { scanDocument } from './dom-scan';
import { eventsToItems } from '../detect/normalize';
import { highlight, clearHighlight } from './overlay';
import type { AuditItem } from '../shared/item';

if (sessionStorage.getItem(AUDIT_FLAG) === '1') {
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('src/panel/index.html');
  Object.assign(iframe.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: '380px',
    height: '100vh',
    border: 'none',
    zIndex: '2147483647',
    boxShadow: '-2px 0 12px rgba(0,0,0,.15)',
  });
  document.documentElement.appendChild(iframe);

  const toPanel = (items: AuditItem[], kind: 'DOM_ITEMS' | 'NETWORK_ITEMS') =>
    iframe.contentWindow?.postMessage({ type: kind, items }, '*');

  window.addEventListener('message', (e) => {
    if (e.data?.__piiAudit && e.data.kind === 'network') toPanel(eventsToItems(e.data.events), 'NETWORK_ITEMS');

    const m = e.data as Msg;
    if (m?.type === 'HIGHLIGHT') {
      const el = document.querySelector(m.selector);
      if (el) {
        const r = el.getBoundingClientRect();
        const rect =
          typeof (r as DOMRect).toJSON === 'function'
            ? (r as DOMRect).toJSON()
            : { x: r.x, y: r.y, width: r.width, height: r.height };
        highlight(rect);
      }
    }
    if (m?.type === 'CLEAR_HIGHLIGHT') clearHighlight();
  });

  const emit = () => toPanel(scanDocument(document), 'DOM_ITEMS');
  emit();
  new MutationObserver(() => emit()).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
