import { isMasked } from '@amplitude/session-replay-dom-privacy';
import type { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';
import { interactionsRecorder } from '../src/recorders/interactions';
import type {
  HostSignals,
  NameSource,
  RecorderContext,
  SemanticFamily,
  SemanticHelpers,
  SemanticPayloads,
} from '../src/types';

function harness(privacy: PrivacyConfig = { defaultMaskLevel: 'medium' }, disabled: SemanticFamily[] = []) {
  const emitted: { family: SemanticFamily; payload: SemanticPayloads[SemanticFamily]; timestamp?: number }[] = [];
  let clock = 1000;
  const signals = new Map<keyof HostSignals, (event: MouseEvent) => void>();
  const ids = new WeakMap<Element, number>();
  let nextId = 1;
  const masked = (element: Element) =>
    isMasked(
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ? 'input' : 'text',
      privacy,
      element as HTMLElement,
      location.href,
    );
  const name = (element: Element): { name: string | null; source: NameSource } => {
    const labelled = element.getAttribute('aria-labelledby');
    const source = labelled ? document.getElementById(labelled) ?? element : element;
    if (masked(source)) return { name: null, source: 'masked' };
    const explicit = element.getAttribute('aria-label');
    return {
      name: labelled ? source.textContent : explicit ?? element.textContent,
      source: labelled ? 'aria-labelledby' : explicit ? 'aria-label' : 'text',
    };
  };
  const helpers: SemanticHelpers = {
    id: (element) => {
      if (!ids.has(element)) ids.set(element, nextId++);
      return ids.get(element) ?? null;
    },
    blocked: (element) => !!element.closest('.amp-block'),
    masked,
    name,
    text: (element, value = element.textContent) => (masked(element) ? null : value),
    role: (element) => element.tagName.toLowerCase(),
    states: () => [],
    describe: (element) => ({
      id: helpers.id(element),
      role: helpers.role(element),
      name: name(element).name,
      name_source: name(element).source,
    }),
    actionable: (element) => element.closest('button') ?? element,
    container: () => null,
    visible: () => true,
    heading: () => null,
    url: () => '/page',
    attributes: () => ({}),
  };
  const context: RecorderContext = {
    onCleanup: () => undefined,
    canEmit: () => true,
    host: {
      document,
      window,
      emit: () => undefined,
      getNodeId: () => 1,
      getPrivacy: () => privacy,
      getUrl: () => location.href,
      sdk: 'test',
      getSelector: jest.fn(() => '#fallback'),
    },
    helpers,
    now: () => clock,
    enabled: (family) => !disabled.includes(family),
    emit: (family, payload, timestamp) => {
      emitted.push({ family, payload, timestamp });
      return true;
    },
    on: (signal, callback) => {
      signals.set(signal, callback as (event: MouseEvent) => void);
      return () => {
        signals.delete(signal);
      };
    },
    subscribe: () => () => undefined,
    dropped: () => ({}),
  };
  return {
    context,
    emitted,
    signals,
    setClock: (value: number) => {
      clock = value;
    },
    start: () => interactionsRecorder.setup(context),
  };
}

function dispatch(element: Element, type: string) {
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

describe('interactions recorder', () => {
  let cleanup: (() => void) | undefined;
  test('skips selector, heading, name and field payload work after capacity is exhausted', () => {
    const h = harness();
    h.context.canEmit = () => false;
    const describe = jest.spyOn(h.context.helpers, 'describe');
    const heading = jest.spyOn(h.context.helpers, 'heading');
    cleanup = h.start();
    document.body.innerHTML = '<button>Go</button><input aria-label="Email">';
    document.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    dispatch(document.querySelector('input')!, 'change');
    expect(describe).not.toHaveBeenCalled();
    expect(heading).not.toHaveBeenCalled();
    expect(h.context.host.getSelector).not.toHaveBeenCalled();
    expect(h.emitted).toHaveLength(0);
  });
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.useRealTimers();
  });

  it('captures actionable click metadata synchronously and uses the entry timestamp', () => {
    document.body.innerHTML = '<button data-amp-key="save"><span>Save</span></button>';
    const h = harness();
    h.context.helpers.heading = () => {
      h.setClock(1005);
      return 'Page';
    };
    cleanup = h.start();
    document.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, ctrlKey: true }));
    expect(h.emitted).toEqual([
      {
        family: 'click',
        timestamp: 1000,
        payload: expect.objectContaining({
          role: 'button',
          name: 'Save',
          key: 'save',
          keyboard: false,
          modifiers: ['ctrl'],
          trusted: false,
        }),
      },
    ]);
    expect(h.context.host.getSelector).not.toHaveBeenCalled();
  });

  it('filters auxclick to middle button, ignores blocked elements and handles finder failure', () => {
    document.body.innerHTML = '<button id=":r2:">Save</button><div class="amp-block"><button>Secret</button></div>';
    const h = harness();
    h.context.host.getSelector = () => {
      throw new Error('timeout');
    };
    cleanup = h.start();
    const button = document.querySelector('button') as HTMLButtonElement;
    button.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }));
    button.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    (document.querySelector('.amp-block button') as HTMLButtonElement).click();
    expect(h.emitted).toHaveLength(1);
    expect(h.emitted[0].payload).toMatchObject({ key: null, selector: null });
  });

  it('uses host-forwarded clicks without adding another click listener', () => {
    document.body.innerHTML = '<button>Save</button>';
    const h = harness();
    h.context.host.externalClicks = true;
    const add = jest.spyOn(document, 'addEventListener');
    cleanup = h.start();
    expect(add.mock.calls.map(([type]) => type)).not.toContain('click');
    const button = document.querySelector('button') as HTMLButtonElement;
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: button });
    h.signals.get('click')?.(event);
    expect(h.emitted).toHaveLength(1);
    cleanup();
    expect(h.signals.size).toBe(0);
  });

  it('retains middle clicks when the host forwards only primary clicks', () => {
    document.body.innerHTML = '<button>Save</button>';
    const h = harness();
    h.context.host.externalClicks = true;
    h.context.host.externalAuxClicks = false;
    const add = jest.spyOn(document, 'addEventListener');
    cleanup = h.start();
    expect(add.mock.calls.map(([type]) => type)).not.toContain('click');
    expect(add.mock.calls.map(([type]) => type)).toContain('auxclick');
    document.querySelector('button')!.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(h.emitted).toHaveLength(1);
  });

  it.each(['light', 'medium', 'conservative'] as const)(
    'never captures typed values at %s masking',
    (defaultMaskLevel) => {
      document.body.innerHTML =
        '<input type="email" aria-label="Email"><input type="password"><input type="hidden"><textarea></textarea><div contenteditable="true"></div>';
      const h = harness({ defaultMaskLevel });
      cleanup = h.start();
      const email = document.querySelector('input') as HTMLInputElement;
      email.value = 'SECRET_INVALID_EMAIL';
      dispatch(email, 'change');
      for (const input of Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type=password], input[type=hidden]'),
      )) {
        input.value = 'HIDDEN_SECRET';
        dispatch(input, 'change');
      }
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'TEXTAREA_SECRET';
      dispatch(textarea, 'change');
      const editable = document.querySelector('[contenteditable]') as HTMLElement;
      editable.textContent = 'EDITABLE_SECRET';
      dispatch(editable, 'focusout');
      expect(h.emitted).toHaveLength(3);
      expect(JSON.stringify(h.emitted)).not.toMatch(/SECRET/);
      expect(h.emitted[0].payload).toMatchObject({
        value_state: 'filled',
        valid: false,
        validity: ['typeMismatch'],
        option_label: null,
      });
    },
  );

  it('deduplicates unchanged field events and reports a changed state immediately', () => {
    document.body.innerHTML = '<input aria-label="Name">';
    const h = harness();
    cleanup = h.start();
    const input = document.querySelector('input') as HTMLInputElement;
    dispatch(input, 'change');
    dispatch(input, 'focusout');
    dispatch(input, 'change');
    expect(h.emitted).toHaveLength(1);
    input.value = 'private';
    dispatch(input, 'focusout');
    expect(h.emitted).toHaveLength(2);
    h.setClock(2000);
    dispatch(input, 'focusout');
    expect(h.emitted).toHaveLength(2);
    dispatch(input, 'change');
    expect(h.emitted).toHaveLength(3);
  });

  it.each(['checkbox', 'radio'])('captures both %s states even when labels are masked', (type) => {
    document.body.innerHTML = `<input type="${type}" value="PRIVATE_VALUE" aria-label="PRIVATE_LABEL">`;
    const h = harness({ defaultMaskLevel: 'conservative' });
    cleanup = h.start();
    const input = document.querySelector('input') as HTMLInputElement;
    dispatch(input, 'change');
    input.checked = true;
    dispatch(input, 'change');
    dispatch(input, 'focusout');
    input.checked = false;
    dispatch(input, 'change');
    expect(h.emitted.map((entry) => (entry.payload as SemanticPayloads['field']).checked)).toEqual([
      false,
      true,
      false,
    ]);
    expect(JSON.stringify(h.emitted)).not.toContain('PRIVATE');
  });

  it('omits checked from non-checkable fields and skips blocked checkboxes', () => {
    document.body.innerHTML =
      '<input><select><option>A</option></select><textarea></textarea><div class="amp-block"><input type="checkbox"></div>';
    const h = harness();
    cleanup = h.start();
    document.querySelectorAll('input,select,textarea').forEach((element) => dispatch(element, 'change'));
    expect(h.emitted).toHaveLength(3);
    h.emitted.forEach((entry) => expect(entry.payload).not.toHaveProperty('checked'));
  });

  it('keeps distinct unknown nodes separate when deduplicating', () => {
    document.body.innerHTML = '<input><input>';
    const h = harness();
    h.context.helpers.id = () => null;
    cleanup = h.start();
    document.querySelectorAll('input').forEach((element) => dispatch(element, 'change'));
    expect(h.emitted).toHaveLength(2);
  });

  it('masks selected options and labels at their source element', () => {
    document.body.innerHTML =
      '<select><option class="amp-mask">PRIVATE_OPTION</option></select><input type="checkbox" aria-labelledby="label" checked><span id="label" class="amp-mask">PRIVATE_LABEL</span>';
    const h = harness({ defaultMaskLevel: 'light' });
    cleanup = h.start();
    document.querySelectorAll('select, input').forEach((element) => dispatch(element, 'change'));
    expect(h.emitted.map((entry) => (entry.payload as SemanticPayloads['field']).option_label)).toEqual([null, null]);
    expect(JSON.stringify(h.emitted)).not.toMatch(/PRIVATE/);
  });

  it('reads defaultPrevented after application handlers and emits no duplicate on cleanup', () => {
    document.body.innerHTML = '<form aria-label="Create"><button>Save</button></form>';
    const h = harness();
    cleanup = h.start();
    const form = document.querySelector('form') as HTMLFormElement;
    form.addEventListener('submit', (event) => event.preventDefault());
    dispatch(form, 'submit');
    expect(h.emitted).toHaveLength(0);
    jest.runOnlyPendingTimers();
    expect(h.emitted[0]).toMatchObject({
      family: 'submit',
      payload: { valid: true, prevented: true, form: { name: 'Create' } },
    });
    dispatch(form, 'submit');
    cleanup();
    jest.runOnlyPendingTimers();
    expect(h.emitted).toHaveLength(1);
  });

  it('batches invalid fields per form, caps at ten and never reads validationMessage', () => {
    document.body.innerHTML =
      '<form aria-label="First">' +
      '<input type="email" required>'.repeat(12) +
      '</form><form aria-label="Second"><input required></form>';
    const h = harness();
    cleanup = h.start();
    for (const input of Array.from(document.querySelectorAll('input'))) {
      Object.defineProperty(input, 'validationMessage', {
        get: () => {
          throw new Error('must not read');
        },
      });
      dispatch(input, 'invalid');
    }
    jest.runOnlyPendingTimers();
    expect(h.emitted).toHaveLength(2);
    expect((h.emitted[0].payload as SemanticPayloads['submit']).invalid_fields).toHaveLength(10);
    expect(h.emitted[0].payload).toMatchObject({ valid: false, prevented: true });
    expect((h.emitted[1].payload as SemanticPayloads['submit']).invalid_fields).toHaveLength(1);
  });

  it('honors attribute masking for stable keys and avoids generated IDs', () => {
    document.body.innerHTML = '<button data-testid="PRIVATE_KEY" id="item1234">Save</button>';
    const h = harness({ defaultMaskLevel: 'conservative', maskAttributes: ['data-testid'] });
    cleanup = h.start();
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(h.emitted[0].payload).toMatchObject({ key: null, name: null, name_source: 'masked', selector: '#fallback' });
    expect(JSON.stringify(h.emitted)).not.toContain('PRIVATE_KEY');
  });

  it('omits blocked fields and reports unmasked selected labels', () => {
    document.body.innerHTML =
      '<div class="amp-block"><input></div><select><option value="SECRET_VALUE">Visible label</option></select><input type="checkbox" aria-label="Agree" checked>';
    const h = harness({ defaultMaskLevel: 'light' });
    cleanup = h.start();
    document.querySelectorAll('input, select').forEach((element) => dispatch(element, 'change'));
    expect(h.emitted).toHaveLength(2);
    expect((h.emitted[0].payload as SemanticPayloads['field']).option_label).toBe('Visible label');
    expect((h.emitted[1].payload as SemanticPayloads['field']).option_label).toBe('Agree');
    expect(JSON.stringify(h.emitted)).not.toContain('SECRET_VALUE');
  });

  it('rechecks privacy after submit handlers and before the deferred emit', () => {
    document.body.innerHTML =
      '<form aria-label="PRIVATE_FORM"><button aria-label="PRIVATE_BUTTON">Save</button></form>';
    const h = harness();
    cleanup = h.start();
    const form = document.querySelector('form') as HTMLFormElement;
    const event = new Event('submit', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'submitter', { value: form.querySelector('button') });
    form.addEventListener('submit', () => form.classList.add('amp-mask'));
    form.dispatchEvent(event);
    jest.runOnlyPendingTimers();
    expect(h.emitted).toHaveLength(1);
    expect(JSON.stringify(h.emitted)).not.toMatch(/PRIVATE/);
    const payload = h.emitted[0].payload as SemanticPayloads['submit'];
    expect(Object.keys(payload.submitter ?? {}).sort()).toEqual(['id', 'name', 'role']);
  });

  it('does not attach listeners for disabled families', () => {
    const h = harness({}, ['click', 'field', 'submit']);
    const add = jest.spyOn(document, 'addEventListener');
    cleanup = h.start();
    expect(add).not.toHaveBeenCalled();
  });

  it('removes all listeners and pending invalid batches during teardown', () => {
    document.body.innerHTML = '<form><input required></form><button>Click</button>';
    const h = harness();
    cleanup = h.start();
    dispatch(document.querySelector('input') as Element, 'invalid');
    cleanup();
    jest.runOnlyPendingTimers();
    dispatch(document.querySelector('input') as Element, 'change');
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(h.emitted).toHaveLength(0);
  });
});
