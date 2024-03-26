/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { formInteractionTracking } from '../../src/plugins/form-interaction-tracking';
import { FORM_DESTINATION, FORM_ID, FORM_NAME } from '../../src/constants';

describe('formInteractionTracking', () => {
  let amplitude = createAmplitudeMock();

  beforeEach(() => {
    amplitude = createAmplitudeMock();

    const form = document.createElement('form');
    form.setAttribute('id', 'my-form-id');
    form.setAttribute('name', 'my-form-name');
    form.setAttribute('action', '/submit');

    const text = document.createElement('input');
    text.setAttribute('type', 'text');
    text.setAttribute('id', 'my-text-id');

    const submit = document.createElement('input');
    submit.setAttribute('type', 'submit');
    submit.setAttribute('id', 'my-submit-id');

    form.appendChild(text);
    form.appendChild(submit);
    document.body.appendChild(form);
  });

  afterEach(() => {
    document.querySelector('form#my-form-id')?.remove();
  });

  test('should not track form_start event when window load event was not triggered', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(0);
  });

  test('should track form_start event', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });

    // trigger change event again
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert second event was not tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start event for a dynamically added form tag', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // add form element dynamically
    const form = document.createElement('form');
    form.setAttribute('id', 'my-form-2-id');
    form.setAttribute('name', 'my-form-2-name');
    form.setAttribute('action', '/submit');

    const text = document.createElement('input');
    text.setAttribute('type', 'text');
    text.setAttribute('id', 'my-text-2-id');

    const submit = document.createElement('input');
    submit.setAttribute('type', 'submit');
    submit.setAttribute('id', 'my-submit-2-id');

    form.appendChild(text);
    form.appendChild(submit);
    document.body.appendChild(form);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    form.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-2-id',
      [FORM_NAME]: 'my-form-2-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });

    // trigger change event again
    form.dispatchEvent(new Event('change'));

    // assert second event was not tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);

    // stop observer and listeners
    await plugin.teardown?.();

    // add form element dynamically
    const form3 = document.createElement('form');
    form3.setAttribute('id', 'my-form-3-id');
    form3.setAttribute('name', 'my-form-3-name');
    form3.setAttribute('action', '/submit');

    const text3 = document.createElement('input');
    text3.setAttribute('type', 'text');
    text3.setAttribute('id', 'my-text-3-id');

    const submit3 = document.createElement('input');
    submit3.setAttribute('type', 'submit');
    submit3.setAttribute('id', 'my-submit-3-id');

    form3.appendChild(text3);
    form3.appendChild(submit3);
    document.body.appendChild(form3);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    form3.dispatchEvent(new Event('change'));

    // assert no additional event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start event for a dynamically added nested form tag', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // add form element dynamically
    const form = document.createElement('form');
    form.setAttribute('id', 'my-form-2-id');
    form.setAttribute('name', 'my-form-2-name');
    form.setAttribute('action', '/submit');

    const text = document.createElement('input');
    text.setAttribute('type', 'text');
    text.setAttribute('id', 'my-text-2-id');

    const submit = document.createElement('input');
    submit.setAttribute('type', 'submit');
    submit.setAttribute('id', 'my-submit-2-id');

    form.appendChild(text);
    form.appendChild(submit);

    const div = document.createElement('div');
    div.appendChild(form);

    document.body.appendChild(div);

    // allow mutation observer to execute and event listener to be attached
    await new Promise((r) => r(undefined)); // basically, await next clock tick
    // trigger change event
    form.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-2-id',
      [FORM_NAME]: 'my-form-2-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });

    // trigger change event again
    form.dispatchEvent(new Event('change'));

    // assert second event was not tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start and form_submit events on change and submit', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // trigger change event again
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });

    // trigger submit event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

    // assert second event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(2);
    expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submitted', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });
  });

  test('should track form_start and form_submit events on submit only', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

    // assert both events were tracked
    expect(amplitude.track).toHaveBeenCalledTimes(2);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });
    expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submitted', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/submit',
    });

    // stop observer and listeners
    await plugin.teardown?.();

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

    // assert no additional event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(2);
  });

  test('should not enrich events', async () => {
    const input = {
      event_type: 'page_view',
    };
    const plugin = formInteractionTracking();
    const result = await plugin.execute?.(input);
    expect(result).toEqual(input);
  });

  // eslint-disable-next-line jest/expect-expect
  test('should teardown plugin', async () => {
    const plugin = formInteractionTracking();
    await plugin.teardown?.();
    // no explicit assertion
    // test asserts that no error is thrown
  });
});
