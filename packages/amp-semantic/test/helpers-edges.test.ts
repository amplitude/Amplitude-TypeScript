import { createHelpers, roleOf, urlTemplate } from '../src/helpers';
import { SemanticHost } from '../src/types';

const host = (): SemanticHost => ({
  document,
  window,
  emit: jest.fn(),
  getNodeId: () => 7,
  getPrivacy: () => ({ defaultMaskLevel: 'light' }),
  getUrl: () => 'https://example.com/',
  sdk: 'test',
});
const element = (html: string): Element => {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
};
afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

test.each([
  ['<a>Caption</a>', 'generic'],
  ['<area href="/">', 'link'],
  ['<div role="presentation">', 'generic'],
  ['<input list="suggestions">', 'combobox'],
  ['<select multiple></select>', 'listbox'],
  ['<select size="2"></select>', 'listbox'],
  ['<select></select>', 'combobox'],
  ['<section aria-label="Results"></section>', 'region'],
  ['<section></section>', 'generic'],
  ['<h2>Heading</h2>', 'heading'],
])('resolves native and explicit roles: %s', (html, role) => expect(roleOf(element(html))).toBe(role));

test('templates malformed URLs without exposing their contents', () => {
  expect(urlTemplate('/a/%ZZ')).toBe('/a/:id');
  expect(urlTemplate('http://[')).toBe('/');
});

test('fails closed when privacy configuration cannot be read', () => {
  const button = element('<button>Secret</button>');
  const h = host();
  h.getPrivacy = () => {
    throw new Error('privacy unavailable');
  };
  expect(createHelpers(h).blocked(button)).toBe(true);
  const badUrl = host();
  badUrl.getUrl = () => {
    throw new Error('URL unavailable');
  };
  expect(createHelpers(badUrl).masked(button)).toBe(true);
  expect(
    createHelpers({ ...host(), getPrivacy: () => ({ blockSelector: '.secret' }) }).blocked(
      element('<div class="secret"></div>'),
    ),
  ).toBe(true);
  expect(
    createHelpers({ ...host(), getPrivacy: () => ({ blockSelector: ['.secret'] }) }).blocked(
      document.body.firstElementChild!,
    ),
  ).toBe(true);
});

test('bounds text traversal and long content; preserves explicit null text', () => {
  const h = createHelpers(host());
  const button = element('<button>' + '<span></span>'.repeat(257) + '</button>');
  expect(h.text(button)).toBeNull();
  button.textContent = 'x'.repeat(200);
  expect(h.text(button)).toBe('x'.repeat(79) + '…');
  expect(h.text(button, null)).toBeNull();
  const text = document.createTextNode('');
  button.replaceChildren(text);
  Object.defineProperty(text, 'nodeValue', { value: null });
  expect(h.text(button)).toBe('');
});

test('resolves names from labels, image captions, static button values and fallback attributes', () => {
  const h = createHelpers(host());
  const named = (html: string, selector: string) => {
    element(html);
    return h.name(document.querySelector(selector)!);
  };
  expect(named('<label id="name">Save</label><button aria-labelledby="missing name"></button>', 'button')).toEqual({
    name: 'Save',
    source: 'aria-labelledby',
  });
  expect(named('<button aria-labelledby="missing" title="Fallback"></button>', 'button')).toEqual({
    name: 'Fallback',
    source: 'title',
  });
  expect(named('<label for="field">Account</label><input id="field">', 'input')).toEqual({
    name: 'Account',
    source: 'label-for',
  });
  expect(named('<label class="amp-mask" for="field">Private</label><input id="field">', 'input')).toEqual({
    name: null,
    source: 'masked',
  });
  expect(named('<img alt="Profile">', 'img')).toEqual({ name: 'Profile', source: 'alt' });
  expect(named('<input type="submit" value="Save">', 'input')).toEqual({ name: 'Save', source: 'value' });
  expect(named('<input placeholder="Search">', 'input')).toEqual({ name: 'Search', source: 'placeholder' });
  expect(named('<input value="typed secret">', 'input')).toEqual({ name: null, source: 'unnamed' });
  expect(named('<label><span class="amp-mask">Private</span><input></label>', 'input')).toEqual({
    name: null,
    source: 'masked',
  });
  expect(named('<label><span contenteditable="true">Private</span><input></label>', 'input')).toEqual({
    name: null,
    source: 'masked',
  });
  expect(named('<label>' + '<span></span>'.repeat(257) + '<input></label>', 'input')).toEqual({
    name: null,
    source: 'masked',
  });
});

test('handles missing label text ancestry and null text defensively', () => {
  const label = element('<label>Caption<input></label>');
  const text = label.firstChild!;
  Object.defineProperty(text, 'parentElement', { value: null });
  Object.defineProperty(text, 'nodeValue', { value: null });
  expect(createHelpers(host()).name(label.querySelector('input')!)).toEqual({ name: null, source: 'unnamed' });
});

test('uses layout visibility fallbacks and fails closed on unsupported layout APIs', () => {
  const button = element('<button>Save</button>');
  const h = createHelpers(host());
  expect(h.visible(button)).toBe(false);
  jest.spyOn(button, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  expect(h.visible(button)).toBe(true);
  (button as HTMLElement).style.visibility = 'hidden';
  expect(h.visible(button)).toBe(false);
  Object.defineProperty(button, 'checkVisibility', {
    value: () => {
      throw new Error('unsupported');
    },
  });
  expect(h.visible(button)).toBe(false);
});

test('finds named containers and actionable ancestors without requiring an interactive leaf', () => {
  const h = createHelpers(host());
  const container = element('<section aria-label="Checkout"><span id="leaf"></span></section>');
  const leaf = container.firstElementChild!;
  expect(h.container(leaf)).toEqual({ id: 7, role: 'region', name: 'Checkout' });
  expect(h.actionable(leaf)).toBe(container);
  expect(h.container(container)).toBeNull();
  const detached = document.createElement('div');
  expect(h.actionable(detached)).toBe(detached);
  const group = element('<div aria-label="Controls"><button></button></div>');
  expect(h.container(group.firstElementChild!)).toEqual({ id: 7, role: 'generic', name: 'Controls' });
});

test('reads ARIA states and allowed attributes while respecting blocked elements', () => {
  const h = createHelpers(host());
  const e = element(
    '<a href="/account/123?secret=x" aria-required="true" aria-checked="true" aria-expanded="false" aria-selected="true" aria-current="page" aria-pressed="true" aria-readonly="true">Go</a>',
  );
  expect(h.states(e)).toEqual(['required', 'checked', 'collapsed', 'selected', 'current', 'pressed', 'readonly']);
  expect(h.attributes(e)).toEqual({ href: '/account/:id' });
  e.setAttribute('aria-expanded', 'true');
  e.setAttribute('aria-current', 'false');
  expect(h.states(e)).toContain('expanded');
  expect(h.states(e)).not.toContain('current');
  e.className = 'amp-block';
  expect(h.attributes(e)).toEqual({});
});

test('handles absent bodies and caches absent headings', () => {
  const h = createHelpers(host());
  jest.spyOn(window.performance, 'now').mockReturnValue(1);
  expect(h.heading()).toBeNull();
  expect(h.heading()).toBeNull();
  const body = document.body;
  body.remove();
  h.invalidateHeading!();
  try {
    expect(h.heading()).toBeNull();
  } finally {
    document.documentElement.appendChild(body);
  }
});

test('prefers a main heading over a visible page heading and skips hidden headings', () => {
  element('<h1>Global</h1><h1 hidden>Hidden</h1><main><div role="heading" aria-level="1">Local</div></main>');
  jest.spyOn(window.performance, 'now').mockReturnValue(1);
  jest.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.hasAttribute('hidden') ? [] : [{}]) as unknown as DOMRectList;
  });
  const h = createHelpers(host());
  expect(h.heading()).toBe('Local');
  document.querySelector('main')!.remove();
  h.invalidateHeading!();
  expect(h.heading()).toBe('Global');
});

test('uses the host URL by default and resolves an interactive ancestor', () => {
  const helpers = createHelpers(host());
  const button = element('<button><span>Continue</span></button>');
  expect(helpers.actionable(button.firstElementChild!)).toBe(button);
  expect(helpers.url()).toBe('/');
  expect(helpers.attributes(element('<a href="/123" type="link">Link</a>'))).toEqual({ href: '/:id', type: 'link' });
});
