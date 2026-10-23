/* eslint-disable no-restricted-globals -- Browser recorder fixtures. */
import { createHelpers } from '../src/helpers';
import { analyticsRecorder } from '../src/recorders/analytics';
import { lifecycleRecorder } from '../src/recorders/lifecycle';
import { keysRecorder } from '../src/recorders/keys';
import { resourceErrorRecorder } from '../src/recorders/resource-error';
import { interactionsRecorder } from '../src/recorders/interactions';
import { SemanticRecorder } from '../src/types';
import { recorderContext } from './page-feedback-helpers';

let cleanup: () => void;
function setup(recorder: SemanticRecorder) {
  const fixture = recorderContext();
  fixture.context.host.getPrivacy = () => ({ defaultMaskLevel: 'light' });
  fixture.context.helpers = createHelpers(fixture.context.host);
  cleanup = recorder.setup(fixture.context);
  return fixture;
}
function fire(element: EventTarget, type: string) {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}
function body(html: string) {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  cleanup = () => undefined;
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('avoids analytics and context payload work after capacity is exhausted', () => {
  const analytics = setup(analyticsRecorder);
  analytics.context.canEmit = () => false;
  analytics.signal('analytics', { eventType: '[Amplitude] Rage Click', properties: {} });
  expect(analytics.emit).not.toHaveBeenCalled();
  cleanup();
  const lifecycle = setup(lifecycleRecorder);
  lifecycle.context.canEmit = () => false;
  lifecycle.signal('snapshot', undefined);
  expect(lifecycle.emit).not.toHaveBeenCalled();
});

test('keeps Alt modifiers on non-character keys', () => {
  const { emit } = setup(keysRecorder);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
  expect(emit).toHaveBeenCalledWith('keys', expect.objectContaining({ key: 'Alt+ArrowLeft' }));
});

test('handles absent and malformed resource URLs, repeated failures, and invalid error targets', () => {
  const { emit } = setup(resourceErrorRecorder);
  body('<img><script src=""></script><link rel="stylesheet"><img src="http://["><img class="amp-block" src="/secret">');
  for (const element of Array.from(document.body.children)) fire(element, 'error');
  fire(document, 'error');
  const image = document.body.firstElementChild!;
  fire(image, 'error');
  image.setAttribute('src', '/next.png');
  fire(image, 'error');
  jest.advanceTimersByTime(500);
  expect(emit.mock.calls.map(([, payload]) => payload)).toEqual([
    { rt: 'img', count: 3 },
    { rt: 'script', count: 1 },
    { rt: 'css', count: 1 },
    { rt: 'img', path: '/next.png', count: 1 },
  ]);
});

test('drops queued resources when disabled and tolerates late native callbacks after teardown', () => {
  const documentListeners = jest.spyOn(document, 'addEventListener');
  const windowListeners = jest.spyOn(window, 'addEventListener');
  const { context, emit } = setup(resourceErrorRecorder);
  const error = documentListeners.mock.calls.find(([type]) => type === 'error')![1] as EventListener;
  const flush = windowListeners.mock.calls.find(([type]) => type === 'pagehide')![1] as EventListener;
  error(new Event('error'));
  fire(body('<img src="/a">'), 'error');
  context.enabled = () => false;
  fire(document.body.firstElementChild!, 'error');
  jest.advanceTimersByTime(500);
  expect(emit).not.toHaveBeenCalled();
  cleanup();
  error(new Event('error'));
  flush(new Event('pagehide'));
  expect(emit).not.toHaveBeenCalled();
});

test('ignores missing font failures, disabling, and late font callbacks', () => {
  const fonts = new EventTarget();
  const original = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  try {
    const listeners = jest.spyOn(fonts, 'addEventListener');
    const { context, emit } = setup(resourceErrorRecorder);
    const error = listeners.mock.calls[0][1] as EventListener;
    error(new Event('loadingerror'));
    const empty = new Event('loadingerror');
    Object.assign(empty, { fontfaces: [] });
    error(empty);
    context.enabled = () => false;
    error(empty);
    cleanup();
    error(empty);
    expect(emit).not.toHaveBeenCalled();
  } finally {
    if (original) Object.defineProperty(document, 'fonts', original);
    else Reflect.deleteProperty(document, 'fonts');
  }
});

test('handles non-element click targets, modifiers, full stable keys and blocked actionable ancestors', () => {
  const { context, emit } = setup(interactionsRecorder);
  const button = body('<button><span>Continue</span></button>');
  const child = button.firstElementChild!;
  child.firstChild!.dispatchEvent(
    new MouseEvent('click', { bubbles: true, altKey: true, metaKey: true, shiftKey: true }),
  );
  expect(emit).toHaveBeenLastCalledWith(
    'click',
    expect.objectContaining({ modifiers: ['alt', 'meta', 'shift'] }),
    expect.any(Number),
  );
  button.setAttribute('data-amp-key', 'x'.repeat(100));
  fire(button, 'click');
  expect(emit).toHaveBeenLastCalledWith('click', expect.objectContaining({ key: 'x'.repeat(100) }), expect.any(Number));
  const blocked = document.createElement('button');
  blocked.className = 'amp-block';
  context.helpers.actionable = () => blocked;
  emit.mockClear();
  fire(child, 'click');
  fire(document, 'click');
  expect(emit).not.toHaveBeenCalled();
});

test('handles empty selections, option label attributes, editable fields and unsuccessful emission', () => {
  const { context, emit } = setup(interactionsRecorder);
  body(
    '<select></select><select><option class="amp-block">Private</option></select><select><option label="Gold">A</option></select><div contenteditable="true"></div>',
  );
  for (const element of Array.from(document.body.children)) fire(element, 'focusout');
  expect(emit.mock.calls.map(([, payload]) => (payload as { option_label: string | null }).option_label)).toEqual([
    null,
    null,
    'Gold',
    null,
  ]);
  emit.mockClear();
  const editable = document.body.lastElementChild!;
  Object.defineProperty(editable, 'textContent', { configurable: true, value: null });
  fire(editable, 'change');
  fire(document, 'focusout');
  fire(document.body, 'focusout');
  expect(emit).not.toHaveBeenCalled();
  emit.mockReturnValue(false);
  fire(editable, 'focusout');
  const input = body('<input>');
  fire(input, 'change');
  fire(input, 'change');
  expect(emit).toHaveBeenCalledTimes(2);
  context.enabled = () => false;
  fire(input, 'change');
  expect(emit).toHaveBeenCalledTimes(2);
});

test('uses a submitter or submit button as the fallback name of an unnamed form', () => {
  const { emit } = setup(interactionsRecorder);
  const form = body('<form><button aria-label="Save"></button></form>');
  const button = form.firstElementChild!;
  form.dispatchEvent(Object.assign(new Event('submit', { bubbles: true }), { submitter: button }));
  jest.runOnlyPendingTimers();
  expect(emit).toHaveBeenLastCalledWith(
    'submit',
    expect.objectContaining({ form: expect.objectContaining({ name: 'Save' }) }),
  );
  fire(form, 'submit');
  jest.runOnlyPendingTimers();
  expect(emit).toHaveBeenLastCalledWith(
    'submit',
    expect.objectContaining({ form: expect.objectContaining({ name: 'Save' }) }),
  );
  button.className = 'amp-block';
  fire(form, 'submit');
  jest.runOnlyPendingTimers();
  expect(emit).toHaveBeenLastCalledWith(
    'submit',
    expect.objectContaining({ form: expect.objectContaining({ name: null }) }),
  );
  button.remove();
  fire(form, 'submit');
  jest.runOnlyPendingTimers();
  expect(emit).toHaveBeenLastCalledWith(
    'submit',
    expect.objectContaining({ form: expect.objectContaining({ name: null }) }),
  );
});

test('rechecks family and capacity for deferred submissions and invalid batches', () => {
  const { context, emit } = setup(interactionsRecorder);
  const form = body('<form><input required></form>');
  const input = form.firstElementChild!;
  fire(document, 'submit');
  fire(document.body, 'invalid');
  fire(document, 'invalid');
  const orphan = document.createElement('input');
  document.body.append(orphan);
  fire(orphan, 'invalid');
  context.enabled = () => false;
  fire(form, 'submit');
  fire(input, 'invalid');
  context.enabled = () => true;
  fire(form, 'submit');
  fire(input, 'invalid');
  context.enabled = () => false;
  jest.runOnlyPendingTimers();
  context.enabled = () => true;
  fire(form, 'submit');
  fire(input, 'invalid');
  context.canEmit = () => false;
  jest.runOnlyPendingTimers();
  context.canEmit = () => true;
  fire(input, 'invalid');
  form.className = 'amp-block';
  jest.runOnlyPendingTimers();
  expect(emit).not.toHaveBeenCalled();
});

test('ignores forwarded clicks without a DOM target and tolerates an unavailable input type', () => {
  const fixture = recorderContext();
  fixture.context.host.externalClicks = true;
  cleanup = interactionsRecorder.setup(fixture.context);
  fixture.signal('click', new MouseEvent('click'));
  expect(fixture.emit).not.toHaveBeenCalled();
  const input = body('<input>');
  Object.defineProperty(input, 'type', { value: '', configurable: true });
  fire(input, 'change');
  expect(fixture.emit).toHaveBeenCalledWith('field', expect.objectContaining({ kind: '' }));
});
