import { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';
import { createHelpers, urlTemplate } from '../src/helpers';
import { SemanticHost } from '../src/types';

const host = (privacy: PrivacyConfig): SemanticHost => ({
  document,
  window,
  emit: jest.fn(),
  getNodeId: () => 7,
  getPrivacy: () => privacy,
  getUrl: () => 'https://example.com/accounts/42?token=secret',
  sdk: 'test',
});

describe('shared privacy helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  test('reuses heading discovery but rechecks text, masking, removal, and invalidation', () => {
    let time = 0;
    jest.spyOn(window.performance, 'now').mockImplementation(() => time);
    document.body.innerHTML = '<main><h1>First</h1></main>';
    const h1 = document.querySelector('h1')!;
    Object.defineProperty(h1, 'checkVisibility', { value: () => true });
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    const walk = jest.spyOn(document, 'createTreeWalker');
    expect(helpers.heading()).toBe('First');
    h1.textContent = 'Changed';
    expect(helpers.heading()).toBe('Changed');
    h1.className = 'amp-mask';
    expect(helpers.heading()).toBeNull();
    expect(walk.mock.calls.filter(([root]) => root === document.body)).toHaveLength(1);
    h1.className = '';
    time = 251;
    expect(helpers.heading()).toBe('Changed');
    expect(walk.mock.calls.filter(([root]) => root === document.body)).toHaveLength(2);
    helpers.invalidateHeading?.();
    expect(helpers.heading()).toBe('Changed');
    expect(walk.mock.calls.filter(([root]) => root === document.body)).toHaveLength(3);
    h1.remove();
    expect(helpers.heading()).toBeNull();
    jest.restoreAllMocks();
  });

  test('reads mixed, busy and native open states without treating mixed as checked', () => {
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.indeterminate = true;
    expect(helpers.states(checkbox)).toEqual(['mixed']);
    checkbox.indeterminate = false;
    expect(helpers.states(checkbox)).toEqual(['checked']);
    checkbox.checked = false;
    expect(helpers.states(checkbox)).toEqual([]);
    const control = document.createElement('button');
    control.setAttribute('aria-pressed', 'mixed');
    control.setAttribute('aria-busy', 'true');
    expect(helpers.states(control)).toEqual(['mixed', 'busy']);
    control.removeAttribute('aria-pressed');
    control.setAttribute('aria-checked', 'mixed');
    control.setAttribute('aria-busy', 'false');
    expect(helpers.states(control)).toEqual(['mixed']);
    for (const tag of ['dialog', 'details', 'div']) {
      const element = document.createElement(tag);
      element.setAttribute('open', '');
      expect(helpers.states(element)).toEqual(tag === 'div' ? [] : ['open']);
      element.removeAttribute('open');
      expect(helpers.states(element)).toEqual([]);
    }
  });
  test('resolves native disabled fieldsets with legend exceptions and nested fieldsets', () => {
    document.body.innerHTML =
      '<fieldset disabled><legend><input id="legend"><fieldset disabled><input id="nested"></fieldset></legend><input id="inherited"><legend><input id="second-legend"></legend></fieldset><input id="own" disabled><div id="aria" aria-disabled="true"></div><div id="generic" disabled></div>';
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    for (const id of ['inherited', 'nested', 'second-legend', 'own', 'aria']) {
      expect(helpers.states(document.getElementById(id)!)).toContain('disabled');
    }
    for (const id of ['legend', 'generic']) {
      expect(helpers.states(document.getElementById(id)!)).not.toContain('disabled');
    }
    document.querySelector('fieldset')!.disabled = false;
    expect(helpers.states(document.getElementById('inherited')!)).not.toContain('disabled');
    expect(helpers.states(document.getElementById('nested')!)).toContain('disabled');
  });

  test.each([
    [null, false],
    ['', false],
    ['false', false],
    ['true', true],
    ['grammar', true],
    ['spelling', true],
    ['unknown-token', true],
  ])('reports aria-invalid=%s consistently', (value, invalid) => {
    const element = document.createElement('div');
    if (value !== null) element.setAttribute('aria-invalid', String(value));
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    expect(helpers.states(element).includes('invalid')).toBe(invalid);
  });

  test('reads native validity without dispatching invalid events', () => {
    const input = document.createElement('input');
    input.required = true;
    const invalid = jest.fn();
    input.addEventListener('invalid', invalid);
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    expect(helpers.states(input)).toEqual(['required', 'invalid']);
    input.value = 'filled';
    expect(helpers.states(input)).toEqual(['required']);
    input.value = '';
    input.disabled = true;
    expect(helpers.states(input)).toEqual(['disabled', 'required']);
    expect(invalid).not.toHaveBeenCalled();
  });

  test.each(['light', 'medium', 'conservative'] as const)('uses replay policy at %s level', (defaultMaskLevel) => {
    document.body.innerHTML =
      '<button>Save</button><input aria-label="Email" type="email" value="private@example.com">';
    const helpers = createHelpers(host({ defaultMaskLevel }));
    expect(helpers.name(document.querySelector('button')!).name).toBe(
      defaultMaskLevel === 'conservative' ? null : 'Save',
    );
    expect(helpers.name(document.querySelector('input')!)).toEqual({ name: null, source: 'masked' });
  });
  test('checks the source label and nested mask decisions', () => {
    document.body.innerHTML =
      '<label id="label" class="amp-mask">Private name</label><input aria-labelledby="label"><button>Save <span class="amp-mask">private account</span></button>';
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    expect(helpers.name(document.querySelector('input')!)).toEqual({ name: null, source: 'masked' });
    expect(helpers.name(document.querySelector('button')!).name).toBeNull();
  });
  test('preserves safe input labels at medium while excluding editable text', () => {
    document.body.innerHTML =
      '<label>Name<input value="secret"></label><div role="button" contenteditable="true">typed secret</div>';
    const helpers = createHelpers(host({ defaultMaskLevel: 'medium' }));
    expect(helpers.name(document.querySelector('input')!).name).toBe('Name');
    expect(helpers.name(document.querySelector('div')!).name).toBeNull();
  });
  test('does not copy textarea contents through referenced or wrapping labels', () => {
    document.body.innerHTML =
      '<textarea id="secret">initial secret</textarea><button aria-labelledby="secret"></button><label>Notes<textarea>another secret</textarea></label>';
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    expect(helpers.name(document.querySelector('button')!).name).toBeNull();
    expect(helpers.name(document.querySelector('label textarea')!).name).toBe('Notes');
  });
  test('fails closed on invalid selectors, blocks descendants, normalizes missing IDs', () => {
    document.body.innerHTML = '<div class="amp-block"><button>Secret</button></div>';
    const element = document.querySelector('button')!;
    expect(createHelpers(host({})).describe(element)).toEqual({
      id: null,
      role: 'button',
      name: null,
      name_source: 'masked',
    });
    expect(createHelpers(host({ maskSelector: ['['] })).text(document.body)).toBeNull();
    document.body.innerHTML = '<button>OK</button>';
    expect(createHelpers({ ...host({}), getNodeId: () => -1 }).id(document.querySelector('button')!)).toBeNull();
  });
  test('respects URL overrides, mask/unmask selectors, and masked attributes', () => {
    document.body.innerHTML = '<button class="public" name="sensitive">Public</button>';
    const element = document.querySelector('button')!;
    expect(
      createHelpers(host({ defaultMaskLevel: 'conservative', unmaskSelector: ['.public'] })).name(element).name,
    ).toBe('Public');
    const helpers = createHelpers(
      host({
        defaultMaskLevel: 'light',
        urlMaskLevels: [{ match: '*accounts*', maskLevel: 'conservative' }],
        maskAttributes: ['name'],
      }),
    );
    expect(helpers.name(element).name).toBeNull();
    expect(helpers.attributes(element)).toEqual({});
  });
  test('preserves full names and does not read live input values', () => {
    document.body.innerHTML = '<input type="text"><button></button>';
    const input = document.querySelector('input')!;
    input.value = 'secret typed string';
    const button = document.querySelector('button')!;
    button.textContent = 'x'.repeat(100);
    const helpers = createHelpers(host({ defaultMaskLevel: 'light' }));
    expect(helpers.name(input).name).toBeNull();
    expect(helpers.name(button).name).toBe('x'.repeat(100));
  });
});

test.each([
  ['mailto:private@example.com', '/'],
  ['tel:+15551234567', '/'],
  ['javascript:alert("private")', '/'],
  ['/accounts/8812#/cards/4', '/accounts/:id#/cards/:id'],
  ['https://example.com/accounts/8812/statements?y=2026#secret', '/accounts/:id/statements'],
  ['/index.html#/cards/4f1c9a2e?token=secret', '/index.html#/cards/:id'],
  ['/index.html#!/items/123#token', '/index.html#!/items/:id'],
  ['/a/550e8400-e29b-41d4-a716-446655440000', '/a/:id'],
  ['/a/abc123456789012345', '/a/:id'],
  ['/a/%31%32%33', '/a/:id'],
  ['/a/' + 'x'.repeat(201), '/a/' + 'x'.repeat(201)],
])('templates %s', (value, expected) => expect(urlTemplate(value)).toBe(expected));
