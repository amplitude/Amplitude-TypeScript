import { isMasked } from '@amplitude/session-replay-dom-privacy';
import { NameSource, SemanticHelpers, SemanticHost } from './types';

const INTERACTIVE = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
  'gridcell',
]);
const CONTAINERS = new Set([
  'banner',
  'navigation',
  'main',
  'complementary',
  'contentinfo',
  'search',
  'form',
  'region',
  'dialog',
  'alertdialog',
  'list',
  'table',
  'row',
  'group',
]);
const CONTENT_NAMES = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
  'alert',
  'status',
  'listitem',
]);
const INPUTS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const ATTRIBUTES = ['type', 'name', 'href', 'target', 'aria-controls', 'aria-haspopup', 'data-testid'];

export function truncate(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? normalized.slice(0, limit - 1) + '…' : normalized;
}

/** Only path-shaped information leaves the browser, including hash router paths. */
export function urlTemplate(value: string, base = 'https://semantic.invalid/'): string {
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '/';
    const route = /^#!?\//.test(parsed.hash) ? '#' + parsed.hash.slice(1).split(/[?#]/)[0] : '';
    const template = (path: string) =>
      path
        .split('/')
        .map((part) => {
          let decoded: string;
          try {
            decoded = decodeURIComponent(part);
          } catch {
            return ':id';
          }
          return /^\d+$/.test(decoded) ||
            /^[\da-f]{8,}$/i.test(decoded) ||
            /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(decoded) ||
            (decoded.length >= 16 && /^[a-z\d]+$/i.test(decoded) && /[a-z]/i.test(decoded) && /\d/.test(decoded))
            ? ':id'
            : part;
        })
        .join('/');
    return template(parsed.pathname) + template(route);
  } catch {
    return '/';
  }
}

export function roleOf(element: Element): string {
  const explicit = element.getAttribute('role')?.trim().split(/\s+/)[0].toLowerCase();
  if (explicit) return explicit === 'none' || explicit === 'presentation' ? 'generic' : explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'a' || tag === 'area') return element.hasAttribute('href') ? 'link' : 'generic';
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    const roles: Record<string, string> = {
      button: 'button',
      image: 'button',
      reset: 'button',
      submit: 'button',
      file: 'button',
      checkbox: 'checkbox',
      radio: 'radio',
      range: 'slider',
      number: 'spinbutton',
      search: 'searchbox',
      hidden: 'generic',
    };
    return roles[type] ?? (element.hasAttribute('list') ? 'combobox' : 'textbox');
  }
  if (tag === 'select')
    return (element as HTMLSelectElement).multiple || (element as HTMLSelectElement).size > 1 ? 'listbox' : 'combobox';
  const roles: Record<string, string> = {
    button: 'button',
    summary: 'button',
    textarea: 'textbox',
    nav: 'navigation',
    main: 'main',
    form: 'form',
    header: 'banner',
    footer: 'contentinfo',
    aside: 'complementary',
    dialog: 'dialog',
    ul: 'list',
    ol: 'list',
    menu: 'list',
    li: 'listitem',
    table: 'table',
    tr: 'row',
    td: 'cell',
    th: 'columnheader',
    img: 'img',
    option: 'option',
    progress: 'progressbar',
    output: 'status',
    fieldset: 'group',
    details: 'group',
    optgroup: 'group',
  };
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'section')
    return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') ? 'region' : 'generic';
  return roles[tag] ?? 'generic';
}

export function createHelpers(host: SemanticHost): SemanticHelpers {
  const blocked = (element: Element): boolean => {
    try {
      const selectors = host.getPrivacy().blockSelector;
      return !!element.closest(
        ['.amp-block', '[data-amp-block]', ...(typeof selectors === 'string' ? [selectors] : selectors ?? [])].join(
          ',',
        ),
      );
    } catch {
      return true;
    }
  };
  const masked = (element: Element): boolean => {
    try {
      return (
        blocked(element) ||
        isMasked(
          INPUTS.has(element.tagName) ? 'input' : 'text',
          host.getPrivacy(),
          element as HTMLElement,
          host.getUrl(),
        )
      );
    } catch {
      return true;
    }
  };
  const editable = (element: Element) => !!element.closest('[contenteditable]:not([contenteditable="false"])');
  // Fail closed for composite text: checking only the container leaks masked descendants.
  // Limit traversal work; an over-budget subtree yields null rather than partial private text.
  const text = (element: Element, value?: string | null, limit = 80): string | null => {
    if (masked(element) || editable(element) || (value === undefined && INPUTS.has(element.tagName))) return null;
    if (value !== undefined) return value === null ? null : truncate(value, limit);
    const walker = host.document.createTreeWalker(element, 1 | 4);
    let node: Node | null;
    let visited = 0;
    let output = '';
    while ((node = walker.nextNode())) {
      if (++visited > 256) return null;
      if (node.nodeType === 1) {
        const child = node as Element;
        if (masked(child) || editable(child) || INPUTS.has(child.tagName)) return null;
      } else {
        output += node.nodeValue ?? '';
      }
      if (output.length > limit * 2) break;
    }
    return truncate(output, limit);
  };
  const name = (element: Element): { name: string | null; source: NameSource } => {
    const finish = (value: string | null, source: NameSource) => ({
      name: value || null,
      source: value === null ? ('masked' as const) : value ? source : ('unnamed' as const),
    });
    if (blocked(element)) return finish(null, 'masked');
    const labelledby = element.getAttribute('aria-labelledby');
    if (labelledby) {
      const parts = labelledby
        .trim()
        .split(/\s+/)
        .slice(0, 20)
        .map((id) => host.document.getElementById(id))
        .filter((el): el is HTMLElement => !!el)
        .map((el) => text(el));
      if (parts.some((part) => part === null)) return finish(null, 'masked');
      const joined = truncate(parts.join(' '), 80);
      if (joined) return finish(joined, 'aria-labelledby');
    }
    const aria = element.getAttribute('aria-label');
    if (aria?.trim()) return finish(text(element, aria), 'aria-label');
    const labels = (element as HTMLInputElement).labels;
    if (labels?.length) {
      const label = labels[0];
      // A wrapping label includes the input node: read its text nodes, never input values.
      let labelText = '';
      if (masked(label)) return finish(null, 'masked');
      let unsafe = false;
      const walker = host.document.createTreeWalker(label, 1 | 4);
      let child: Node | null;
      let visited = 0;
      while ((child = walker.nextNode())) {
        if (++visited > 256) {
          unsafe = true;
          break;
        }
        if (child.nodeType === 1 && child !== element && (masked(child as Element) || editable(child as Element))) {
          unsafe = true;
          break;
        }
        if (
          child.nodeType === 3 &&
          !child.parentElement?.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')
        )
          labelText += child.nodeValue ?? '';
      }
      return finish(unsafe ? null : text(label, labelText), label.htmlFor ? 'label-for' : 'label-wrap');
    }
    if (element.tagName === 'IMG' && element.hasAttribute('alt'))
      return finish(text(element, element.getAttribute('alt')), 'alt');
    // Static button captions are attributes, never a live input value.
    if (
      element.tagName === 'INPUT' &&
      /^(button|submit|reset)$/i.test(element.getAttribute('type') ?? '') &&
      element.hasAttribute('value')
    )
      return finish(text(element, element.getAttribute('value')), 'value');
    if (CONTENT_NAMES.has(roleOf(element))) {
      const content = text(element);
      if (content === null || content) return finish(content, 'text');
    }
    for (const attribute of ['title', 'placeholder'] as const) {
      const value = element.getAttribute(attribute);
      if (value) return finish(text(element, value), attribute);
    }
    return finish('', 'unnamed');
  };
  const id = (element: Element) => {
    if (blocked(element)) return null;
    const value = host.getNodeId(element);
    return value < 0 ? null : value;
  };
  const describe = (element: Element) => {
    const result = name(element);
    return { id: id(element), role: roleOf(element), name: result.name, name_source: result.source };
  };
  const visible = (element: Element): boolean => {
    const enhanced = element as Element & {
      checkVisibility?: (options: { opacityProperty: boolean; visibilityProperty: boolean }) => boolean;
    };
    try {
      return enhanced.checkVisibility
        ? enhanced.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : element.getClientRects().length > 0 && host.window.getComputedStyle(element).visibility !== 'hidden';
    } catch {
      return false;
    }
  };
  return {
    id,
    blocked,
    masked,
    text,
    name,
    describe,
    visible,
    role: roleOf,
    url: (value = host.getUrl()) => urlTemplate(value, host.getUrl()),
    actionable: (element) => {
      let current: Element | null = element;
      let fallback = element;
      for (let depth = 0; current && depth < 12; depth++, current = current.parentElement) {
        const role = roleOf(current);
        if (INTERACTIVE.has(role)) return current;
        if (fallback === element && role !== 'generic') fallback = current;
      }
      return fallback;
    },
    container: (element) => {
      let current = element.parentElement;
      for (let depth = 0; current && depth < 20; depth++, current = current.parentElement) {
        if (CONTAINERS.has(roleOf(current)) || current.hasAttribute('aria-label')) {
          const result = describe(current);
          return { id: result.id, role: result.role, name: result.name };
        }
      }
      return null;
    },
    states: (element) => {
      const states: string[] = [];
      const native = element as HTMLInputElement & HTMLOptionElement;
      const mixed =
        (element.tagName === 'INPUT' && native.type === 'checkbox' && native.indeterminate) ||
        element.getAttribute('aria-checked') === 'mixed' ||
        element.getAttribute('aria-pressed') === 'mixed';
      for (const [state, yes] of Object.entries({
        disabled: native.disabled || element.getAttribute('aria-disabled') === 'true',
        required: native.required || element.getAttribute('aria-required') === 'true',
        invalid: element.getAttribute('aria-invalid') === 'true',
        checked: !mixed && (native.checked || element.getAttribute('aria-checked') === 'true'),
        mixed,
        busy: element.getAttribute('aria-busy') === 'true',
        open: (element.tagName === 'DETAILS' || element.tagName === 'DIALOG') && element.hasAttribute('open'),
        expanded: element.getAttribute('aria-expanded') === 'true',
        collapsed: element.getAttribute('aria-expanded') === 'false',
        selected: native.selected || element.getAttribute('aria-selected') === 'true',
        current: element.hasAttribute('aria-current') && element.getAttribute('aria-current') !== 'false',
        pressed: element.getAttribute('aria-pressed') === 'true',
        readonly: native.readOnly || element.getAttribute('aria-readonly') === 'true',
      })) {
        if (yes) states.push(state);
      }
      return states;
    },
    heading: () => {
      for (const selector of [
        'main h1, [role="main"] h1, main [role="heading"][aria-level="1"], [role="main"] [role="heading"][aria-level="1"]',
        'h1',
      ]) {
        const candidates = host.document.querySelectorAll(selector);
        for (let i = 0; i < Math.min(candidates.length, 40); i++)
          if (visible(candidates[i])) return text(candidates[i]);
      }
      return null;
    },
    attributes: (element) => {
      const result: Record<string, string> = {};
      if (blocked(element)) return result;
      for (const key of ATTRIBUTES) {
        const value = element.getAttribute(key);
        if (value === null || (host.getPrivacy().maskAttributes?.includes(key) && masked(element))) continue;
        result[key] = truncate(key === 'href' ? urlTemplate(value, host.getUrl()) : value, 60);
      }
      return result;
    },
  };
}
