/* eslint-disable @typescript-eslint/unbound-method */

import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { formInteractionTracking } from '../../src/plugins/form-interaction-tracking';
import { FORM_DESTINATION, FORM_ID, FORM_NAME } from '../../src/constants';

// SubmitEvent is not available in JSDOM, so we need to polyfill it
if (typeof SubmitEvent === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).SubmitEvent = function SubmitEvent(
    this: Event & { submitter: HTMLElement | null },
    type: string,
    eventInitDict?: SubmitEventInit,
  ) {
    const event = new Event(type, eventInitDict);
    Object.setPrototypeOf(event, SubmitEvent.prototype);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event as any).submitter = eventInitDict?.submitter ?? null;
    return event;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).SubmitEvent.prototype = Object.create(Event.prototype);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).SubmitEvent.prototype.constructor = (global as any).SubmitEvent;
}

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

  test('should track form_start event when the plugin is added after window load', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);

    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
  });

  test('should track form_start event when the plugin is added before window load', async () => {
    const originalReadyState = document.readyState;
    Object.defineProperty(document, 'readyState', {
      value: 'loading',
      writable: true,
      configurable: true,
    });

    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);

    // trigger change event
    window.dispatchEvent(new Event('load'));
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));

    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);

    // Restore the original value after each test
    Object.defineProperty(document, 'readyState', {
      value: originalReadyState,
      writable: true,
    });
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

  test('should return current location if form action attribute is missing', async () => {
    // setup
    const config = createConfigurationMock();
    const plugin = formInteractionTracking();
    await plugin.setup?.(config, amplitude);
    window.dispatchEvent(new Event('load'));

    // Remove form action
    document.getElementById('my-form-id')?.removeAttribute('action');
    // trigger change event
    document.getElementById('my-form-id')?.dispatchEvent(new Event('change'));
    // assert first event was tracked
    expect(amplitude.track).toHaveBeenCalledTimes(1);
    expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
      [FORM_ID]: 'my-form-id',
      [FORM_NAME]: 'my-form-name',
      [FORM_DESTINATION]: 'http://localhost/',
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

  describe('shouldTrackSubmit', () => {
    test('should not track form_submit when shouldTrackSubmit returns false', async () => {
      const shouldTrackSubmit = jest.fn(() => false);
      const config = createConfigurationMock({
        defaultTracking: {
          formInteractions: {
            shouldTrackSubmit,
          },
        },
      });
      const plugin = formInteractionTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      // trigger submit event with SubmitEvent
      document.getElementById('my-form-id')?.dispatchEvent(new SubmitEvent('submit'));

      // assert shouldTrackSubmit was called
      expect(shouldTrackSubmit).toHaveBeenCalledTimes(1);

      // assert form_start was tracked but form_submit was NOT
      expect(amplitude.track).toHaveBeenCalledTimes(1);
      expect(amplitude.track).toHaveBeenNthCalledWith(1, '[Amplitude] Form Started', {
        [FORM_ID]: 'my-form-id',
        [FORM_NAME]: 'my-form-name',
        [FORM_DESTINATION]: 'http://localhost/submit',
      });
    });

    test('should not re-track form_start on subsequent submit when shouldTrackSubmit returns false', async () => {
      const shouldTrackSubmit = jest.fn(() => false);
      const config = createConfigurationMock({
        defaultTracking: {
          formInteractions: {
            shouldTrackSubmit,
          },
        },
      });
      const plugin = formInteractionTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      // trigger first submit event (tracks form_start)
      document.getElementById('my-form-id')?.dispatchEvent(new SubmitEvent('submit'));
      expect(amplitude.track).toHaveBeenCalledTimes(1);

      // trigger second submit event (should NOT track form_start again)
      document.getElementById('my-form-id')?.dispatchEvent(new SubmitEvent('submit'));

      // assert shouldTrackSubmit was called twice
      expect(shouldTrackSubmit).toHaveBeenCalledTimes(2);

      // assert form_start was only tracked once (no duplicate)
      expect(amplitude.track).toHaveBeenCalledTimes(1);
    });

    test('should track form_submit when shouldTrackSubmit returns true', async () => {
      const shouldTrackSubmit = jest.fn(() => true);
      const config = createConfigurationMock({
        defaultTracking: {
          formInteractions: {
            shouldTrackSubmit,
          },
        },
      });
      const plugin = formInteractionTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      // trigger submit event with SubmitEvent
      document.getElementById('my-form-id')?.dispatchEvent(new SubmitEvent('submit'));

      // assert shouldTrackSubmit was called
      expect(shouldTrackSubmit).toHaveBeenCalledTimes(1);

      // assert both form_start and form_submit were tracked
      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submitted', {
        [FORM_ID]: 'my-form-id',
        [FORM_NAME]: 'my-form-name',
        [FORM_DESTINATION]: 'http://localhost/submit',
      });
    });

    test('should track form_submit normally when shouldTrackSubmit is not provided', async () => {
      const config = createConfigurationMock({
        defaultTracking: {
          formInteractions: {},
        },
      });
      const plugin = formInteractionTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      // trigger submit event
      document.getElementById('my-form-id')?.dispatchEvent(new Event('submit'));

      // assert both form_start and form_submit were tracked
      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submitted', {
        [FORM_ID]: 'my-form-id',
        [FORM_NAME]: 'my-form-name',
        [FORM_DESTINATION]: 'http://localhost/submit',
      });
    });

    test('should log warning and proceed with tracking when shouldTrackSubmit throws an error', async () => {
      const shouldTrackSubmit = jest.fn(() => {
        throw new Error('Test error');
      });
      const config = createConfigurationMock({
        defaultTracking: {
          formInteractions: {
            shouldTrackSubmit,
          },
        },
      });
      const warnSpy = jest.spyOn(config.loggerProvider, 'warn');
      const plugin = formInteractionTracking();
      await plugin.setup?.(config, amplitude);
      window.dispatchEvent(new Event('load'));

      // trigger submit event with SubmitEvent
      document.getElementById('my-form-id')?.dispatchEvent(new SubmitEvent('submit'));

      // assert shouldTrackSubmit was called
      expect(shouldTrackSubmit).toHaveBeenCalledTimes(1);

      // assert warning was logged
      expect(warnSpy).toHaveBeenCalledWith('shouldTrackSubmit callback threw an error, proceeding with tracking.');

      // assert both form_start and form_submit were still tracked despite the error
      expect(amplitude.track).toHaveBeenCalledTimes(2);
      expect(amplitude.track).toHaveBeenNthCalledWith(2, '[Amplitude] Form Submitted', {
        [FORM_ID]: 'my-form-id',
        [FORM_NAME]: 'my-form-name',
        [FORM_DESTINATION]: 'http://localhost/submit',
      });
    });
  });
});
