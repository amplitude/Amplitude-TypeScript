/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { formInteractionTracking } from '../../src/plugins/form-interaction-tracking';

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

  test('should track form_start event', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup(config, amplitude);

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Start', {
      form_id: 'my-form-id',
      form_name: 'my-form-name',
      form_destination: 'http://localhost/submit',
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
    await plugin.setup(config, amplitude);

    // add form elemen dynamically
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
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Start', {
      form_id: 'my-form-2-id',
      form_name: 'my-form-2-name',
      form_destination: 'http://localhost/submit',
    });

    // trigger change event again
    form.dispatchEvent(new Event('change'));

    // assert second event was not tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start event for a dynamically added nested form tag', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup(config, amplitude);

    // add form elemen dynamically
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
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Start', {
      form_id: 'my-form-2-id',
      form_name: 'my-form-2-name',
      form_destination: 'http://localhost/submit',
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
    await plugin.setup(config, amplitude);

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

    // assert both events were tracked
    expect(amplitude.track).toHaveBeenCalledTimes(2);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Start', {
      form_id: 'my-form-id',
      form_name: 'my-form-name',
      form_destination: 'http://localhost/submit',
    });
    expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submit', {
      form_id: 'my-form-id',
      form_name: 'my-form-name',
      form_destination: 'http://localhost/submit',
    });
  });

  test('should track form_start and form_submit events on submit only', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup(config, amplitude);

    // trigger change event again
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Start', {
      form_id: 'my-form-id',
      form_name: 'my-form-name',
      form_destination: 'http://localhost/submit',
    });

    // trigger submit event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

    // assert second event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(2);
    expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submit', {
      form_id: 'my-form-id',
      form_name: 'my-form-name',
      form_destination: 'http://localhost/submit',
    });
  });

  test('should not enrich events', async () => {
    const input = {
      event_type: 'page_view',
    };
    const plugin = formInteractionTracking();
    const result = await plugin.execute(input);
    expect(result).toEqual(input);
  });
});
