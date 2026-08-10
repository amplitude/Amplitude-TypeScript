import { AuditItem, ItemContext, makeId } from '../shared/item';

function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 5) {
    let sel = node.nodeName.toLowerCase();
    if (node.id) {
      sel += `#${node.id}`;
      parts.unshift(sel);
      break;
    }
    const cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    if (cls) sel += `.${cls}`;
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function nearestHeading(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    let sib = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent?.trim();
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}

function contextFor(el: Element): ItemContext {
  const container = el.closest('[class]');
  const labelEl = el.previousElementSibling?.tagName === 'LABEL' ? el.previousElementSibling : el.closest('label');
  return {
    label: labelEl?.textContent?.trim(),
    ariaLabel: el.getAttribute('aria-label') ?? undefined,
    nearestHeading: nearestHeading(el),
    containerClass: container?.getAttribute('class') ?? undefined,
    selectorPath: cssPath(el),
  };
}

export function scanDocument(root: ParentNode): AuditItem[] {
  const out: AuditItem[] = [];
  const seen = new Set<string>();

  root.querySelectorAll('input, textarea').forEach((el) => {
    const v = (el as HTMLInputElement).value?.trim();
    if (v) push(el, v);
  });

  root.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return;
    const v = el.textContent?.trim();
    if (v && v.length <= 200) push(el, v);
  });

  function push(el: Element, value: string) {
    const selector = cssPath(el);
    const id = makeId(['dom', selector, value]);
    if (seen.has(id)) return;
    seen.add(id);
    const r = el.getBoundingClientRect();
    const rect =
      typeof (r as DOMRect).toJSON === 'function'
        ? (r as DOMRect).toJSON()
        : { x: r.x, y: r.y, width: r.width, height: r.height };
    out.push({
      id,
      source: 'dom',
      value,
      selector,
      rect,
      context: contextFor(el),
    });
  }

  return out;
}
