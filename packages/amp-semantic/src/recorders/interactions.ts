import { getInputType } from '@amplitude/session-replay-dom-privacy';
import { getHelpers, isAriaInvalid } from '../helpers';
import type {
  NamedTarget,
  RecorderContext,
  SemanticHelpers,
  SemanticPayloads,
  SemanticRecorder,
  TargetDescription,
} from '../types';

type InteractionContext = RecorderContext & { helpers: SemanticHelpers };

const FIELD_SELECTOR =
  'input, select, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const VALIDITY_FLAGS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooShort',
  'tooLong',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
] as const;

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function eventElement(event: Event): Element | null {
  const target = event.target as Node | null;
  return target?.nodeType === 1 ? (target as Element) : target?.parentElement ?? null;
}

function isFormControl(element: Element): element is FormControl {
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}

function sensitiveField(element: Element): boolean {
  if (element.tagName !== 'INPUT') return false;
  const type = getInputType(element as HTMLInputElement);
  return type === 'password' || type === 'hidden';
}

/** Native scalar values only: selection state and editable DOM have separate contracts. */
function fieldValue(element: Element, masked: boolean): { value?: string } {
  if (masked) return {};
  if (element.tagName === 'TEXTAREA') return { value: (element as HTMLTextAreaElement).value };
  if (element.tagName !== 'INPUT') return {};
  const input = element as HTMLInputElement;
  if (['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'image'].includes(input.type)) return {};
  return { value: input.value };
}

function hasFieldValue(element: Element): boolean {
  if (element.tagName === 'INPUT' && ['checkbox', 'radio'].includes((element as HTMLInputElement).type)) {
    return (element as HTMLInputElement).checked;
  }
  return isFormControl(element) ? element.value.length > 0 : (element.textContent?.length ?? 0) > 0;
}

function validityOf(element: Element): { valid: boolean; validity: string[] } {
  const flags: string[] = [];
  if (isFormControl(element)) {
    for (const flag of VALIDITY_FLAGS) {
      if (element.validity[flag]) flags.push(flag);
    }
  }
  if (isAriaInvalid(element)) flags.push('ariaInvalid');
  return {
    valid: (!isFormControl(element) || element.validity.valid) && !flags.includes('ariaInvalid'),
    validity: flags,
  };
}

/** Never use a field's contents as its accessible name, even when text is unmasked. */
function fieldDescription(context: InteractionContext, element: Element): NamedTarget {
  const { name, source } = context.helpers.name(element);
  return {
    id: context.helpers.id(element),
    role: context.helpers.role(element),
    name: source === 'text' || source === 'value' ? null : name,
    name_source: source === 'text' || source === 'value' ? 'masked' : source,
  };
}

function stableKey(context: InteractionContext, element: Element): string | null {
  const maskedAttributes = context.host.getPrivacy().maskAttributes ?? [];
  for (const attribute of ['data-amp-key', 'data-testid', 'data-test', 'data-cy', 'id']) {
    const value = element.getAttribute(attribute);
    if (!value || (maskedAttributes.includes(attribute) && context.helpers.masked(element))) continue;
    if (
      attribute === 'id' &&
      (/^\d+$/.test(value) || /[a-f\d]{8,}/i.test(value) || /:r/.test(value) || /\d{3,}/.test(value))
    )
      continue;
    return value;
  }
  return null;
}

function optionLabel(context: InteractionContext, element: Element, masked: boolean): string | null {
  if (masked) return null;
  if (element.tagName === 'SELECT') {
    const option = (element as HTMLSelectElement).selectedOptions[0];
    if (!option || context.helpers.blocked(option)) return null;
    return option.hasAttribute('label') ? context.helpers.text(option, option.label) : context.helpers.text(option);
  }
  if (element.tagName === 'INPUT' && ['radio', 'checkbox'].includes((element as HTMLInputElement).type)) {
    if (!(element as HTMLInputElement).checked) return null;
    return fieldDescription(context, element).name;
  }
  return null;
}

/** Browser interaction facts; owns only its listeners and task-scoped submit batches. */
export const interactionsRecorder: SemanticRecorder = {
  families: ['click', 'field', 'submit'],
  setup(context) {
    const scoped = context as InteractionContext;
    scoped.helpers = context.helpers ?? getHelpers(context.host);
    const { host, helpers } = scoped;
    const cleanups: (() => void)[] = [];
    const timers = new Set<number>();
    let active = true;
    const lastFields = new WeakMap<Element, { payload: string; timestamp: number }>();
    const invalidForms = new Map<HTMLFormElement, Set<Element>>();
    const pendingSubmits = new Map<Event, { timer: number; emit: () => void }>();
    let invalidTimer: number | undefined;

    const defer = (callback: () => void): number => {
      const timer = host.window.setTimeout(() => {
        timers.delete(timer);
        if (active) callback();
      }, 0);
      timers.add(timer);
      return timer;
    };
    const listen = (type: string, callback: (event: Event) => void) => {
      host.document.addEventListener(type, callback, true);
      cleanups.push(() => host.document.removeEventListener(type, callback, true));
    };

    const click = (event: MouseEvent) => {
      const timestamp = scoped.now();
      if (!active || !scoped.enabled('click') || (event.type === 'auxclick' && event.button !== 1)) return;
      const target = eventElement(event);
      if (!target || helpers.blocked(target)) return;
      const element = helpers.actionable(target);
      if (helpers.blocked(element)) return;
      if (!scoped.canEmit('click')) return;
      const key = stableKey(scoped, element);
      let selector: string | null = null;
      if (!key && host.getSelector) {
        try {
          selector = host.getSelector(element);
        } catch {
          /* The host finder may time out. */
        }
      }
      scoped.emit(
        'click',
        {
          ...helpers.describe(element),
          container: helpers.container(element),
          states: helpers.states(element),
          visible: helpers.visible(element),
          key,
          ...(key ? {} : { selector }),
          attrs: helpers.attributes(element),
          url: helpers.url(),
          heading: helpers.heading(),
          keyboard: event.detail === 0,
          modifiers: [
            event.altKey ? 'alt' : '',
            event.ctrlKey ? 'ctrl' : '',
            event.metaKey ? 'meta' : '',
            event.shiftKey ? 'shift' : '',
          ].filter(Boolean),
          trusted: event.isTrusted,
        },
        timestamp,
      );
    };

    const field = (event: Event) => {
      if (!scoped.enabled('field')) return;
      const target = eventElement(event);
      const element = target?.closest(FIELD_SELECTOR);
      if (
        !element ||
        (event.type === 'change' && !isFormControl(element)) ||
        sensitiveField(element) ||
        helpers.blocked(element)
      )
        return;
      if (!scoped.canEmit('field')) return;
      const masked = helpers.masked(element);
      const payload: SemanticPayloads['field'] = {
        ...fieldDescription(scoped, element),
        states: helpers.states(element),
        kind:
          element.tagName === 'INPUT'
            ? (element as HTMLInputElement).type
            : isFormControl(element)
            ? element.tagName.toLowerCase()
            : 'contenteditable',
        value_state: hasFieldValue(element) ? 'filled' : 'empty',
        ...(element.tagName === 'INPUT' && ['checkbox', 'radio'].includes((element as HTMLInputElement).type)
          ? { checked: (element as HTMLInputElement).checked }
          : {}),
        ...fieldValue(element, masked),
        ...validityOf(element),
        masked,
        option_label: optionLabel(scoped, element, masked),
      };
      const serialized = JSON.stringify(payload);
      const last = lastFields.get(element);
      const now = scoped.now();
      if (last?.payload === serialized && (event.type === 'focusout' || now - last.timestamp < 500)) return;
      if (scoped.emit('field', payload)) lastFields.set(element, { payload: serialized, timestamp: now });
    };

    const describeForm = (form: HTMLFormElement, submitter: Element | null): TargetDescription => {
      const description = helpers.describe(form);
      if (description.name === null && description.name_source !== 'masked') {
        const fallback =
          submitter ??
          form.querySelector('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]');
        if (fallback && !helpers.blocked(fallback)) description.name = helpers.name(fallback).name;
      }
      return { id: description.id, role: description.role, name: description.name };
    };

    const formValidity = (form: HTMLFormElement) => {
      let valid = true;
      const invalid_fields: SemanticPayloads['submit']['invalid_fields'] = [];
      for (const control of Array.from(form.elements)) {
        if (!isFormControl(control)) continue;
        const result = validityOf(control);
        if (result.valid) continue;
        valid = false;
        if (invalid_fields.length >= 10 || sensitiveField(control) || helpers.blocked(control)) continue;
        const description = fieldDescription(scoped, control);
        invalid_fields.push({ id: description.id, name: description.name, validity: result.validity });
      }
      return { valid, invalid_fields };
    };

    const submit = (event: Event) => {
      if (!scoped.enabled('submit')) return;
      const form = eventElement(event) as HTMLFormElement | null;
      if (form?.tagName !== 'FORM' || helpers.blocked(form)) return;
      const candidate = (event as SubmitEvent).submitter;
      const submitter = candidate && !helpers.blocked(candidate) ? candidate : null;
      // Do not call checkValidity(): that would dispatch new invalid events into the page.
      const emit = () => {
        if (!scoped.enabled('submit') || helpers.blocked(form)) return;
        if (!scoped.canEmit('submit')) return;
        const { valid, invalid_fields } = formValidity(form);
        scoped.emit('submit', {
          form: describeForm(form, submitter && !helpers.blocked(submitter) ? submitter : null),
          submitter:
            submitter && !helpers.blocked(submitter)
              ? { id: helpers.id(submitter), role: helpers.role(submitter), name: helpers.name(submitter).name }
              : null,
          valid,
          invalid_fields,
          prevented: event.defaultPrevented,
        });
      };
      // Flush at the end of bubbling, after form and document handlers but before
      // a native navigation can discard the deferred task. Keep the task as a
      // fallback for applications that stop propagation.
      const timer = defer(() => {
        pendingSubmits.delete(event);
        emit();
      });
      pendingSubmits.set(event, { timer, emit });
    };

    const flushSubmit = (event: Event) => {
      const pending = pendingSubmits.get(event);
      if (!pending) return;
      pendingSubmits.delete(event);
      host.window.clearTimeout(pending.timer);
      timers.delete(pending.timer);
      pending.emit();
    };

    const invalid = (event: Event) => {
      if (!scoped.enabled('submit')) return;
      const element = eventElement(event);
      if (!element || !isFormControl(element)) return;
      const form = element.form;
      if (!form || helpers.blocked(form)) return;
      let fields = invalidForms.get(form);
      if (!fields) {
        fields = new Set();
        invalidForms.set(form, fields);
      }
      if (!sensitiveField(element) && !helpers.blocked(element) && fields.size < 10) fields.add(element);
      if (invalidTimer !== undefined) return;
      invalidTimer = defer(() => {
        invalidTimer = undefined;
        const batches = [...invalidForms];
        invalidForms.clear();
        if (!scoped.enabled('submit')) return;
        for (const [invalidForm, invalidFields] of batches) {
          if (helpers.blocked(invalidForm)) continue;
          if (!scoped.canEmit('submit')) continue;
          scoped.emit('submit', {
            form: describeForm(invalidForm, null),
            submitter: null,
            valid: false,
            prevented: true,
            invalid_fields: [...invalidFields]
              .filter((fieldElement) => !helpers.blocked(fieldElement) && !sensitiveField(fieldElement))
              .map((fieldElement) => {
                const description = fieldDescription(scoped, fieldElement);
                return { id: description.id, name: description.name, validity: validityOf(fieldElement).validity };
              }),
          });
        }
      });
    };

    if (scoped.enabled('click')) {
      if (host.externalClicks) cleanups.push(scoped.on('click', click));
      else listen('click', (event) => click(event as MouseEvent));
      if (!(host.externalAuxClicks ?? host.externalClicks)) listen('auxclick', (event) => click(event as MouseEvent));
    }
    if (scoped.enabled('field')) {
      listen('change', field);
      listen('focusout', field);
    }
    if (scoped.enabled('submit')) {
      listen('submit', submit);
      host.window.addEventListener('submit', flushSubmit);
      cleanups.push(() => host.window.removeEventListener('submit', flushSubmit));
      const flushSubmitsOnExit = () => {
        for (const event of pendingSubmits.keys()) flushSubmit(event);
      };
      host.window.addEventListener('pagehide', flushSubmitsOnExit);
      cleanups.push(() => host.window.removeEventListener('pagehide', flushSubmitsOnExit));
      listen('invalid', invalid);
    }
    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
      timers.forEach((timer) => host.window.clearTimeout(timer));
      timers.clear();
      pendingSubmits.clear();
      invalidForms.clear();
    };
  },
};
